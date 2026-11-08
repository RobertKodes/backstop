variable "environment" {
  description = "devnet | mainnet"
  type        = string
  validation {
    condition     = contains(["devnet", "mainnet"], var.environment)
    error_message = "environment must be devnet or mainnet"
  }
}

variable "region" {
  type    = string
  default = "eu-west-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.40.0.0/16"
}

variable "image_tag" {
  description = "Tag of the service images in ECR (one per release)."
  type        = string
}

variable "certificate_arn" {
  description = "ACM certificate for HTTPS on the load balancer. Empty = HTTP only (devnet demo)."
  type        = string
  default     = ""
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.medium"
}

variable "db_multi_az" {
  type    = bool
  default = false
}

variable "redis_node_type" {
  type    = string
  default = "cache.t4g.small"
}

variable "markets_json" {
  description = "MARKETS for keeper/agent, e.g. output of scripts/ts genesis."
  type        = string
}

variable "agent_dry_run" {
  description = "Keep the AI agent in dry-run until a week of posts has been reviewed."
  type        = bool
  default     = true
}

variable "x_enabled" {
  type    = bool
  default = false
}

variable "services" {
  description = "CPU/memory/count per service."
  type = map(object({
    cpu    = number
    memory = number
    count  = number
  }))
  default = {
    indexer = { cpu = 512, memory = 1024, count = 1 }
    api     = { cpu = 512, memory = 1024, count = 2 }
    keeper  = { cpu = 256, memory = 512, count = 1 }
    agent   = { cpu = 256, memory = 512, count = 1 }
    web     = { cpu = 512, memory = 1024, count = 2 }
  }
}

variable "alarm_email" {
  description = "Optional address for CloudWatch alarm notifications."
  type        = string
  default     = ""
}
