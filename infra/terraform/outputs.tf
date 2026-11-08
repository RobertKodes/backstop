output "url" {
  description = "Public URL of the web app (API under /v1, OpenAPI under /docs)."
  value       = "${local.https ? "https" : "http"}://${aws_lb.main.dns_name}"
}

output "helius_webhook_url" {
  value = "${local.https ? "https" : "http"}://${aws_lb.main.dns_name}/helius"
}

output "ecr_repositories" {
  value = { for k, r in aws_ecr_repository.service : k => r.repository_url }
}

output "secrets_to_fill" {
  description = "Secret ARNs whose values must be set out of band before the services start."
  value       = { for k, s in aws_secretsmanager_secret.service : k => s.arn }
}
