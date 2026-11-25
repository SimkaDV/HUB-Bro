# Значок HUB BRO в трее (область уведомлений Windows). Сам хаб и сервер данных работают как задача HubBroServer
# от имени SYSTEM — такие процессы значков показывать не могут, поэтому значок — отдельная маленькая программа
# в сеансе пользователя. Без Python и других зависимостей: только PowerShell и Windows Forms.
#
# Цвет: зелёный — хаб и сервер данных работают; жёлтый — работает только одно; красный — ничего.
# Меню: состояние, «Открыть кабинет», «Выключить хаб» / «Включить хаб», «Перезапустить хаб» (всё это спросит права
# администратора — хаб работает от SYSTEM), «Открыть лог хаба», «Открыть лог сервера данных», «Убрать значок».
# «Выключить хаб» — до перезагрузки (при включении компьютера хаб стартует сам). Сервер данных при этом остаётся, если на
# компьютере стоит бот: он нужен боту и приложению BOT BRO; без бота выключается и он.
#
# Запуск при входе в Windows — задача HubBroTray (её создаёт deploy.sh), вручную — hub-tray.vbs (без окна).
# Файл сохранён в UTF-8 с BOM: иначе Windows PowerShell 5.1 прочитает русский текст как «кракозябры».

$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$Server = $PSScriptRoot                                # ...\avito\hub-bro\server
$Avito = Split-Path (Split-Path $Server)               # ...\avito
$HubLog = Join-Path $Server "server.log"
$DataLog = Join-Path $Avito "data\server\data.log"
$TrayLog = Join-Path $Server "hub-tray.log"
$Ts = "$env:ProgramFiles\Tailscale\tailscale.exe"

function Log($t) { try { Add-Content -Path $TrayLog -Value ("{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $t) -Encoding UTF8 } catch {} }

# Один значок на компьютер.
$created = $false
$mutex = New-Object System.Threading.Mutex($true, "Global\avito-hub-bro-tray", [ref]$created)
if (-not $created) { exit 0 }

function Up($url) {
    try {
        $req = [Net.WebRequest]::Create($url); $req.Timeout = 1500; $req.Method = "GET"
        $res = $req.GetResponse(); $code = [int]$res.StatusCode; $res.Close(); return ($code -lt 500)
    } catch [Net.WebException] {
        # 401 (нужен ключ) и другие ответы сервера = сервер жив
        return ($_.Exception.Response -ne $null -and [int]$_.Exception.Response.StatusCode -lt 500)
    } catch { return $false }
}

function HubUrl {
    if (Test-Path $Ts) {
        try { $d = ((& $Ts status --json 2>$null | ConvertFrom-Json).Self.DNSName).TrimEnd("."); if ($d) { return "https://$d" } } catch {}
    }
    return "http://127.0.0.1:8790"
}

function MakeIcon($color) {
    $bmp = New-Object System.Drawing.Bitmap 32, 32
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "AntiAlias"; $g.TextRenderingHint = "AntiAliasGridFit"
    $g.FillEllipse((New-Object System.Drawing.SolidBrush $color), 1, 1, 30, 30)
    $font = New-Object System.Drawing.Font("Segoe UI", 15, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = "Center"; $fmt.LineAlignment = "Center"
    $g.DrawString("H", $font, [System.Drawing.Brushes]::White, (New-Object System.Drawing.RectangleF(0, 1, 32, 32)), $fmt)
    $g.Dispose()
    return [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}
$Icons = @{
    ok   = MakeIcon ([System.Drawing.Color]::FromArgb(46, 125, 50))
    part = MakeIcon ([System.Drawing.Color]::FromArgb(201, 138, 0))
    down = MakeIcon ([System.Drawing.Color]::FromArgb(198, 40, 40))
}

$tray = New-Object System.Windows.Forms.NotifyIcon
$tray.Icon = $Icons.down
$tray.Text = "HUB BRO: проверка…"
$tray.Visible = $true

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$stateItem = $menu.Items.Add("Проверка…"); $stateItem.Enabled = $false
[void]$menu.Items.Add("-")
$openItem = $menu.Items.Add("Открыть кабинет")
$toggleItem = $menu.Items.Add("Выключить хаб")
$restartItem = $menu.Items.Add("Перезапустить хаб")
[void]$menu.Items.Add("-")
$hubLogItem = $menu.Items.Add("Открыть лог хаба")
$dataLogItem = $menu.Items.Add("Открыть лог сервера данных")
[void]$menu.Items.Add("-")
$exitItem = $menu.Items.Add("Убрать значок")
$tray.ContextMenuStrip = $menu

$script:last = ""
$script:hubUp = $false
function Refresh {
    $hub = Up "http://127.0.0.1:8790/"
    $data = Up "http://127.0.0.1:8791/api/health"
    if ($hub -and $data) { $s = "ok"; $text = "HUB BRO работает" }
    elseif ($hub) { $s = "part"; $text = "HUB BRO: сервер данных не отвечает" }
    elseif ($data) { $s = "part"; $text = "HUB BRO: кабинет не отвечает" }
    else { $s = "down"; $text = "HUB BRO не работает" }
    $script:hubUp = $hub
    $toggleItem.Text = if ($hub) { "Выключить хаб" } else { "Включить хаб" }
    $tray.Icon = $Icons[$s]
    $tray.Text = $text                      # подсказка при наведении (до 63 символов)
    $stateItem.Text = $text
    if ($s -ne $script:last) {
        Log "state $s"
        if ($script:last -eq "ok" -and $s -ne "ok") {
            $tray.ShowBalloonTip(8000, "HUB BRO", "$text. Меню значка → «Перезапустить хаб».", [System.Windows.Forms.ToolTipIcon]::Warning)
        }
        $script:last = $s
    }
}

$openItem.add_Click({ Start-Process (HubUrl) })

# Команда с правами администратора (задача HubBroServer работает от SYSTEM). Windows спросит разрешение.
function RunAdmin($cmd, $what) {
    $enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
    try { Start-Process powershell -Verb RunAs -WindowStyle Hidden -ArgumentList "-NoProfile -EncodedCommand $enc"; return $true }
    catch { Log "$what cancelled: $($_.Exception.Message)"; return $false }
}

$toggleItem.add_Click({
    if ($script:hubUp) {
        $keepData = Test-Path (Join-Path $Avito "bot")
        $msg = "Выключить HUB BRO? Кабинет перестанет открываться у всех до перезагрузки компьютера или до «Включить хаб»." +
               $(if ($keepData) { "`n`nСервер данных останется работать — он нужен боту." } else { "" })
        $ok = [System.Windows.Forms.MessageBox]::Show($msg, "HUB BRO", "YesNo", "Warning")
        if ($ok -ne "Yes") { return }
        Log "turn off requested (keep data server: $keepData)"
        # хаб — node с «server\server.mjs» без «data\» перед ним; сервер данных — «data\server\server.mjs»
        $pattern = if ($keepData) { '(?<!data\\)server\\server\.mjs' } else { 'server\\server\.mjs' }
        $cmd = @"
schtasks /End /TN HubBroServer | Out-Null
Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { `$_.CommandLine -match '$pattern' } |
  ForEach-Object { Stop-Process -Id `$_.ProcessId -Force -ErrorAction SilentlyContinue }
"@
        if (RunAdmin $cmd "turn off") {
            $tray.ShowBalloonTip(5000, "HUB BRO", "Хаб выключается.", [System.Windows.Forms.ToolTipIcon]::Info)
        }
    } else {
        Log "turn on requested"
        if (RunAdmin "schtasks /Run /TN HubBroServer | Out-Null" "turn on") {
            $tray.ShowBalloonTip(5000, "HUB BRO", "Хаб включается — около 10 секунд.", [System.Windows.Forms.ToolTipIcon]::Info)
        }
    }
    $timer.Stop(); $timer.Interval = 4000; $timer.Start()   # быстрее показать новое состояние, потом снова раз в 10 с
})
$restartItem.add_Click({
    Log "restart requested"
    # Задача работает от SYSTEM: остановить и запустить её можно только с правами администратора (Windows спросит).
    $cmd = @'
schtasks /End /TN HubBroServer | Out-Null
Get-CimInstance Win32_Process -Filter "name='node.exe'" | Where-Object { $_.CommandLine -match 'server\\server\.mjs' } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep 2
schtasks /Run /TN HubBroServer | Out-Null
'@
    if (RunAdmin $cmd "restart") {
        $tray.ShowBalloonTip(5000, "HUB BRO", "Хаб перезапускается — около 10 секунд.", [System.Windows.Forms.ToolTipIcon]::Info)
    }
})
$hubLogItem.add_Click({ if (Test-Path $HubLog) { Start-Process notepad.exe $HubLog } })
$dataLogItem.add_Click({ if (Test-Path $DataLog) { Start-Process notepad.exe $DataLog } })
$exitItem.add_Click({ Log "closed from the menu"; $timer.Stop(); $tray.Visible = $false; [System.Windows.Forms.Application]::Exit() })
$tray.add_DoubleClick({ Start-Process (HubUrl) })

$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 10000
$timer.add_Tick({ Refresh; if ($timer.Interval -ne 10000) { $timer.Interval = 10000 } })
Log "tray started"
Refresh
$timer.Start()
[System.Windows.Forms.Application]::Run()
$tray.Dispose()
$mutex.ReleaseMutex()
