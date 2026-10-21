<#
.SYNOPSIS
  Saves one API secret in SSM Parameter Store (/lexflow/prod/<Name>) as a SecureString.

.DESCRIPTION
  The value is typed at a hidden prompt: it is not echoed, not kept in the shell history and
  only touches disk in a temporary file that is deleted right after the upload. The API reads every parameter under /lexflow/prod/ when it starts
  (src/lib/load-secrets.ts), so a new value takes effect on the next cold start or deploy.
  See docs/aws-deployment.md, step 4.

.EXAMPLE
  .\infra\scripts\set-secret.ps1 DATABASE_URL
#>
param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[A-Z][A-Z0-9_]*$')]
  [string]$Name,
  [string]$Profile = "lexflow",
  [string]$Region = "us-east-1"
)

$secure = Read-Host -AsSecureString "Value for $Name (hidden)"
$value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
if ([string]::IsNullOrWhiteSpace($value)) { Write-Error "Empty value: nothing saved."; exit 1 }

# Passed through a temporary file readable only by this user, so it never appears in a
# process command line; the file is deleted right after.
$file = New-TemporaryFile
try {
  [IO.File]::WriteAllText($file.FullName, $value)
  aws ssm put-parameter --profile $Profile --region $Region --name "/lexflow/prod/$Name" --type SecureString --overwrite --value "file://$($file.FullName)" --query Version --output text |
    ForEach-Object { Write-Host "Saved /lexflow/prod/$Name (version $_)." }
} finally {
  Remove-Item $file.FullName -Force
  $value = $null
}
