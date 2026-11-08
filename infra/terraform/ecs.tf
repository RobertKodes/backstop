locals {
  redis_url = "rediss://${aws_elasticache_replication_group.main.primary_endpoint_address}:6379"
  secret    = { for k, s in aws_secretsmanager_secret.service : k => s.arn }
  # Services that write state or send transactions run as a single task.
  singletons = ["keeper", "agent", "indexer"]

  # Per-service container settings. Secrets resolve from Secrets Manager at
  # task start; nothing secret is in the task definition or Terraform state.
  containers = {
    indexer = {
      port = 8788
      env = {
        INDEXER_PORT   = "8788"
        POLLER_ENABLED = "true"
        REDIS_URL      = local.redis_url
      }
      secrets = {
        DATABASE_URL          = aws_secretsmanager_secret.database_url.arn
        RPC_URL               = local.secret.rpc_url
        HELIUS_WEBHOOK_SECRET = local.secret.helius_webhook
      }
    }
    api = {
      port = 8787
      env = {
        API_PORT              = "8787"
        REDIS_URL             = local.redis_url
        RATE_LIMIT_PER_MINUTE = "240"
      }
      secrets = { DATABASE_URL = aws_secretsmanager_secret.database_url.arn }
    }
    keeper = {
      port = 8790
      env = {
        DASHBOARD_PORT  = "8790"
        MARKETS         = var.markets_json
        JUPITER_ENABLED = var.environment == "mainnet" ? "true" : "false"
      }
      secrets = {
        DATABASE_URL      = aws_secretsmanager_secret.database_url.arn
        RPC_URL           = local.secret.rpc_url
        KEEPER_KEYPAIR    = local.secret.keeper_keypair
        ALERT_WEBHOOK_URL = local.secret.alert_webhook
      }
    }
    agent = {
      port = 8791
      env = {
        HEALTH_PORT = "8791"
        MARKETS     = var.markets_json
        DRY_RUN     = var.agent_dry_run ? "true" : "false"
        X_ENABLED   = var.x_enabled ? "true" : "false"
      }
      secrets = merge(
        {
          DATABASE_URL      = aws_secretsmanager_secret.database_url.arn
          RPC_URL           = local.secret.rpc_url
          AGENT_KEYPAIR     = local.secret.agent_keypair
          ANTHROPIC_API_KEY = local.secret.anthropic_api_key
        },
        var.x_enabled ? { X_ACCESS_TOKEN = local.secret.x_access_token } : {},
      )
    }
    web = {
      port    = 3000
      env     = { PORT = "3000" }
      secrets = {}
    }
  }
}

resource "aws_ecr_repository" "service" {
  for_each             = local.containers
  name                 = "backstop/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  image_scanning_configuration {
    scan_on_push = true
  }
}

resource "aws_ecr_lifecycle_policy" "service" {
  for_each   = aws_ecr_repository.service
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep the last 30 images"
      selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
      action       = { type = "expire" }
    }]
  })
}

resource "aws_ecs_cluster" "main" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.containers
  name              = "/backstop/${var.environment}/${each.key}"
  retention_in_days = var.environment == "mainnet" ? 365 : 30
}

data "aws_iam_policy_document" "ecs_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "execution" {
  name               = "${local.name}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# The execution role can read only the secrets referenced by task definitions.
data "aws_iam_policy_document" "secrets" {
  statement {
    actions   = ["secretsmanager:GetSecretValue"]
    resources = distinct(flatten([for c in values(local.containers) : values(c.secrets)]))
  }
}

resource "aws_iam_role_policy" "secrets" {
  name   = "read-service-secrets"
  role   = aws_iam_role.execution.id
  policy = data.aws_iam_policy_document.secrets.json
}

# Tasks need no AWS API access at runtime.
resource "aws_iam_role" "task" {
  name               = "${local.name}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_assume.json
}

resource "aws_ecs_task_definition" "service" {
  for_each                 = local.containers
  family                   = "${local.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.services[each.key].cpu
  memory                   = var.services[each.key].memory
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task.arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name                   = each.key
    image                  = "${aws_ecr_repository.service[each.key].repository_url}:${var.image_tag}"
    essential              = true
    readonlyRootFilesystem = each.key != "web"
    portMappings           = [{ containerPort = each.value.port, protocol = "tcp" }]
    environment            = [for k, v in merge(each.value.env, { LOG_LEVEL = "info", NODE_ENV = "production" }) : { name = k, value = v }]
    secrets                = [for k, arn in each.value.secrets : { name = k, valueFrom = arn }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
        awslogs-region        = var.region
        awslogs-stream-prefix = each.key
      }
    }
  }])
}

locals {
  target_groups = {
    api     = aws_lb_target_group.api.arn
    web     = aws_lb_target_group.web.arn
    indexer = aws_lb_target_group.indexer.arn
  }
}

resource "aws_ecs_service" "service" {
  for_each                           = local.containers
  name                               = each.key
  cluster                            = aws_ecs_cluster.main.id
  task_definition                    = aws_ecs_task_definition.service[each.key].arn
  desired_count                      = contains(local.singletons, each.key) ? 1 : var.services[each.key].count
  launch_type                        = "FARGATE"
  deployment_minimum_healthy_percent = contains(local.singletons, each.key) ? 0 : 100
  deployment_maximum_percent         = contains(local.singletons, each.key) ? 100 : 200
  network_configuration {
    subnets          = aws_subnet.private[*].id
    security_groups  = [aws_security_group.services.id]
    assign_public_ip = false
  }
  dynamic "load_balancer" {
    for_each = contains(keys(local.target_groups), each.key) ? [each.key] : []
    content {
      target_group_arn = local.target_groups[load_balancer.value]
      container_name   = load_balancer.value
      container_port   = each.value.port
    }
  }
  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }
  depends_on = [aws_lb_listener.http]
}
