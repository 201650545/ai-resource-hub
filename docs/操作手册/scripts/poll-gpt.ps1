# GPT 镜像生成轮询监管快捷封装
# 用法: .\poll-gpt.ps1 <会话名> [-MaxWait 300] [-Out "path.md"]
param(
  [Parameter(Mandatory=$true)][string]$Session,
  [int]$MaxWait = 300,
  [string]$Out = ""
)
$scriptDir = $PSScriptRoot
node (Join-Path $scriptDir "poll.mjs") $Session $MaxWait $Out
exit $LASTEXITCODE