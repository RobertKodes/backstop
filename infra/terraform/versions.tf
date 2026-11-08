terraform {
  required_version = ">= 1.6"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.80, < 7.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
  # Remote state: copy backend.tf.example to backend.tf and fill in the bucket.
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      Project     = "backstop"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  }
}
