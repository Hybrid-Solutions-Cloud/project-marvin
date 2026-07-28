param(
  [string]$ComposeFile = "compose.yaml"
)

docker compose -f $ComposeFile ps
