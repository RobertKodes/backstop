# Infrastructure (Terraform, AWS)

One environment per state file (`devnet`, `mainnet`).

| Resource | Purpose |
|---|---|
| VPC (2 public + 2 private subnets, NAT) | services and data stores in private subnets |
| RDS Postgres 16 (encrypted, backups 7 d, deletion protection on mainnet) | indexer data, keeper audit log, agent runs/posts |
| ElastiCache Redis 7 (TLS) | API cache, rate limits, live event channel |
| ECR repositories (immutable tags, scan on push) | `indexer`, `api`, `keeper`, `agent`, `web` images |
| ECS Fargate (ARM64) | `api` and `web` (scaled), `indexer`, `keeper`, `agent` (singletons) |
| ALB | `/` web, `/v1/*` + `/docs` API (incl. WebSocket), `/helius` indexer webhook |
| Secrets Manager | RPC URL, webhook secret, keeper/agent keys, Anthropic key, X token, alert webhook, DB URL |
| CloudWatch | logs per service, alarms (singleton down, API 5xx, DB CPU) → SNS |

Secrets are created **empty**; their values never pass through Terraform or
its state (except the generated database URL).

## Apply

```bash
cd infra/terraform
cp backend.tf.example backend.tf          # remote state (S3 + DynamoDB lock)
cp terraform.tfvars.example devnet.tfvars # fill in markets_json from scripts/ts/out/devnet.json
terraform init
terraform plan -var-file=devnet.tfvars
terraform apply -var-file=devnet.tfvars

# then set every secret listed in `terraform output secrets_to_fill`, e.g.
aws secretsmanager put-secret-value --secret-id backstop-devnet/keeper_keypair --secret-string file://keeper.json
```

## Images

```bash
TAG=v0.1.0
for s in indexer api keeper agent; do
  docker build --platform linux/arm64 --build-arg SERVICE=$s -t <ecr>/backstop/$s:$TAG .
done
docker build --platform linux/arm64 -f web/Dockerfile \
  --build-arg NEXT_PUBLIC_API_URL=https://<host> --build-arg NEXT_PUBLIC_RPC_URL=<public rpc> \
  --build-arg NEXT_PUBLIC_CLUSTER=devnet --build-arg NEXT_PUBLIC_MINT=<mint> \
  --build-arg NEXT_PUBLIC_QUOTE_MINT=<quote> -t <ecr>/backstop/web:$TAG .
```

Point the Helius webhook at `terraform output helius_webhook_url` with the
shared secret. The public RPC used by the web app must not carry a private
API key (it is visible in the browser).
