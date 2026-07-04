$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "Requesting admin privileges..."
    $scriptPath = $MyInvocation.MyCommand.Path
    Start-Process powershell -Verb RunAs -ArgumentList "-NoExit", "-ExecutionPolicy", "Bypass", "-File", "`"$scriptPath`""
    exit
}

$VAULT_PATH = "D:\Project\obsidian-plugin-dev"
$PLUGIN_DIR = "$VAULT_PATH\.obsidian\plugins\obs-project-manager"

Write-Host "Creating plugin directory: $PLUGIN_DIR"
New-Item -ItemType Directory -Path $PLUGIN_DIR -Force | Out-Null

Write-Host "Creating symbolic links..."
$mainJsTarget = "D:\Project\obs-project-manager\main.js"
$manifestTarget = "D:\Project\obs-project-manager\manifest.json"
$stylesTarget = "D:\Project\obs-project-manager\styles.css"

if (Test-Path "$PLUGIN_DIR\main.js") { Remove-Item "$PLUGIN_DIR\main.js" -Force }
if (Test-Path "$PLUGIN_DIR\manifest.json") { Remove-Item "$PLUGIN_DIR\manifest.json" -Force }
if (Test-Path "$PLUGIN_DIR\styles.css") { Remove-Item "$PLUGIN_DIR\styles.css" -Force }

New-Item -ItemType SymbolicLink -Path "$PLUGIN_DIR\main.js" -Target $mainJsTarget
New-Item -ItemType SymbolicLink -Path "$PLUGIN_DIR\manifest.json" -Target $manifestTarget
New-Item -ItemType SymbolicLink -Path "$PLUGIN_DIR\styles.css" -Target $stylesTarget

Write-Host ""
Write-Host "Symbolic links created successfully!"
Write-Host "Press any key to exit..."
$Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown") | Out-Null
