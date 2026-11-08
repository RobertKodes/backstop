# Secret *containers* only. Values for keys and API tokens are written out of
# band (aws secretsmanager put-secret-value) and never pass through Terraform
# state — except the generated database URL.

locals {
  secret_names = {
    rpc_url           = "Helius RPC URL (with API key)"
    helius_webhook    = "Shared secret for the Helius webhook"
    keeper_keypair    = "Keeper hot key (JSON array)"
    agent_keypair     = "AI agent hot key (JSON array)"
    anthropic_api_key = "Anthropic API key for the agent"
    x_access_token    = "X OAuth 2.0 user token (tweet.write), only if X posting is enabled"
    alert_webhook     = "Alert webhook URL (Slack/Discord)"
  }
}

resource "aws_secretsmanager_secret" "service" {
  for_each    = local.secret_names
  name        = "${local.name}/${each.key}"
  description = each.value
}

resource "aws_secretsmanager_secret" "database_url" {
  name        = "${local.name}/database_url"
  description = "Postgres connection string (generated)"
}

resource "aws_secretsmanager_secret_version" "database_url" {
  secret_id     = aws_secretsmanager_secret.database_url.id
  secret_string = "postgres://backstop:${random_password.db.result}@${aws_db_instance.main.address}:5432/backstop?sslmode=require"
}
