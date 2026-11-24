[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Source,

    [Parameter(Mandatory = $true)]
    [string]$Output,

    [ValidateSet('JPG', 'PNG')]
    [string]$Format = 'JPG',

    [ValidateRange(1, 10000)]
    [int]$Width = 1920,

    [ValidateRange(1, 10000)]
    [int]$Height = 1080
)

$ErrorActionPreference = 'Stop'
$sourceRoot = (Resolve-Path -LiteralPath $Source).Path.TrimEnd('\', '/')
$outputRoot = [IO.Path]::GetFullPath($Output)
$logPath = Join-Path $outputRoot 'export-log.txt'
$libraryPath = Join-Path $outputRoot 'library.js'
$null = New-Item -ItemType Directory -Path $outputRoot -Force
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$logLines = New-Object 'System.Collections.Generic.List[string]'
$libraryDecks = New-Object 'System.Collections.Generic.List[object]'
$powerPoint = $null
$ocrData = $null
$ocrPath = Join-Path (Split-Path -Parent $PSScriptRoot) 'ocr\ocr-text.json'

function Add-Log {
    param([string]$Message)
    $line = '{0} {1}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'), $Message
    $logLines.Add($line)
    Write-Host $line
}

function Get-NaturalKey {
    param([string]$Value)
    return [regex]::Replace($Value, '\d+', [System.Text.RegularExpressions.MatchEvaluator]{
        param($match)
        $match.Value.PadLeft(20, '0')
    })
}

function Release-ComObject {
    param([object]$Value)
    if ($null -ne $Value -and [Runtime.InteropServices.Marshal]::IsComObject($Value)) {
        try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($Value) } catch {}
    }
}

function Get-ShapeText {
    param([object]$Shape)
    $parts = New-Object 'System.Collections.Generic.List[string]'
    $textFrame = $null
    $textRange = $null
    try {
        if ($Shape.Type -eq 6) {
            $items = $Shape.GroupItems
            try {
                for ($i = 1; $i -le $items.Count; $i++) {
                    $child = $items.Item($i)
                    try {
                        $text = Get-ShapeText -Shape $child
                        if (-not [string]::IsNullOrWhiteSpace($text)) { $parts.Add($text) }
                    } finally { Release-ComObject $child }
                }
            } finally { Release-ComObject $items }
        } elseif ($Shape.HasTextFrame) {
            $textFrame = $Shape.TextFrame
            if ($textFrame.HasText) {
                $textRange = $textFrame.TextRange
                $parts.Add([string]$textRange.Text)
            }
        }
    } catch {}
    finally {
        Release-ComObject $textRange
        Release-ComObject $textFrame
    }
    return ($parts -join "`n")
}

function Get-RelativeSourcePath {
    param([string]$FullPath)
    $prefix = $sourceRoot.TrimEnd('\', '/') + [IO.Path]::DirectorySeparatorChar
    return $FullPath.Substring($prefix.Length).Replace('\', '/')
}

function Get-OcrSlideText {
    param([string]$RelativeSource, [int]$SlideNumber)
    if ($null -eq $ocrData -or $null -eq $ocrData.decks) { return $null }
    $deckProperty = $ocrData.decks.PSObject.Properties[$RelativeSource]
    if ($null -eq $deckProperty -or $null -eq $deckProperty.Value.slides) { return $null }
    $slideProperty = $deckProperty.Value.slides.PSObject.Properties[[string]$SlideNumber]
    if ($null -eq $slideProperty) { return $null }
    return [string]$slideProperty.Value.ocrText
}

if (Test-Path -LiteralPath $ocrPath) {
    try {
        $ocrData = Get-Content -LiteralPath $ocrPath -Raw -Encoding UTF8 | ConvertFrom-Json
        Add-Log "Loaded optional OCR text from $ocrPath"
    } catch {
        Add-Log "OCR file ignored: $($_.Exception.Message)"
    }
}

$files = Get-ChildItem -LiteralPath $sourceRoot -Recurse -File |
    Where-Object {
        $_.Extension -in @('.pptx', '.ppt', '.pptm') -and
        $_.Name -notlike '~$*' -and
        $_.Name -notlike '._*' -and
        $_.FullName -notmatch '(^|[\\/])__MACOSX([\\/]|$)'
    } |
    Sort-Object @{ Expression = { Get-NaturalKey (Get-RelativeSourcePath $_.FullName) } }, FullName

try {
    $powerPoint = New-Object -ComObject PowerPoint.Application
    $powerPoint.AutomationSecurity = 3
    try { $powerPoint.DisplayAlerts = 1 } catch {}
    try { $powerPoint.Visible = $false } catch {}

    foreach ($file in $files) {
        $relativeSource = Get-RelativeSourcePath $file.FullName
        $deckName = [IO.Path]::GetFileName($file.Name)
        $deckTitle = [IO.Path]::GetFileNameWithoutExtension($file.Name)
        $relativeDirectory = [IO.Path]::GetDirectoryName($relativeSource.Replace('/', '\'))
        if ([string]::IsNullOrEmpty($relativeDirectory)) { $relativeDirectory = '' }
        $relativeDeckOutput = if ($relativeDirectory) {
            Join-Path $relativeDirectory $deckName
        } else {
            $deckName
        }
        $deckOutput = Join-Path $outputRoot $relativeDeckOutput
        $deckJsonPath = Join-Path $deckOutput 'deck.json'
        $null = New-Item -ItemType Directory -Path $deckOutput -Force
        $size = [long]$file.Length
        $mtime = $file.LastWriteTimeUtc.ToString('o')
        $slides = New-Object 'System.Collections.Generic.List[object]'
        $presentation = $null
        $slideCollection = $null

        try {
            $oldDeck = $null
            if (Test-Path -LiteralPath $deckJsonPath) {
                try { $oldDeck = Get-Content -LiteralPath $deckJsonPath -Raw -Encoding UTF8 | ConvertFrom-Json } catch {}
            }

            if ($null -ne $oldDeck -and [long]$oldDeck.size -eq $size -and [string]$oldDeck.mtime -eq $mtime) {
                foreach ($oldSlide in $oldDeck.slides) { $slides.Add($oldSlide) }
                Add-Log "SKIP unchanged: $relativeSource"
            } else {
                Add-Log "OPEN: $relativeSource"
                $presentation = $powerPoint.Presentations.Open($file.FullName, -1, 0, 0)
                $slideCollection = $presentation.Slides
                $slideCount = [int]$slideCollection.Count
                $extension = if ($Format -eq 'PNG') { 'png' } else { 'jpg' }

                for ($n = 1; $n -le $slideCount; $n++) {
                    $slide = $null
                    $shapeCollection = $null
                    $transition = $null
                    $textParts = New-Object 'System.Collections.Generic.List[string]'
                    try {
                        $slide = $slideCollection.Item($n)
                        $shapeCollection = $slide.Shapes
                        for ($shapeIndex = 1; $shapeIndex -le $shapeCollection.Count; $shapeIndex++) {
                            $shape = $null
                            try {
                                $shape = $shapeCollection.Item($shapeIndex)
                                $shapeText = Get-ShapeText -Shape $shape
                                if (-not [string]::IsNullOrWhiteSpace($shapeText)) { $textParts.Add($shapeText) }
                            } finally { Release-ComObject $shape }
                        }

                        $imageName = 'slide-{0:D4}.{1}' -f $n, $extension
                        $imagePath = Join-Path $deckOutput $imageName
                        $slide.Export($imagePath, $Format, $Width, $Height)
                        $hidden = $false
                        try {
                            $transition = $slide.SlideShowTransition
                            $hidden = [bool]$transition.Hidden
                        } catch {}
                        $slides.Add([pscustomobject]@{
                            n = $n
                            file = $imageName
                            hidden = $hidden
                            text = ($textParts -join "`n")
                        })
                    } finally {
                        Release-ComObject $transition
                        Release-ComObject $shapeCollection
                        Release-ComObject $slide
                    }
                }
            }

            $slideCount = $slides.Count
            for ($slideIndex = 0; $slideIndex -lt $slides.Count; $slideIndex++) {
                $slideInfo = $slides[$slideIndex]
                $ocrText = Get-OcrSlideText -RelativeSource $relativeSource -SlideNumber ([int]$slideInfo.n)
                if ($null -ne $ocrText -and $ocrText.Length -gt 0) {
                    $slides[$slideIndex] = [pscustomobject]@{
                        n = $slideInfo.n
                        file = $slideInfo.file
                        hidden = $slideInfo.hidden
                        text = $slideInfo.text
                        ocrText = $ocrText
                        ocrSource = 'gemini'
                    }
                }
            }

            $deck = [pscustomobject]@{
                title = $deckTitle
                source = $relativeSource
                size = $size
                mtime = $mtime
                slideCount = $slideCount
                slides = @($slides)
            }
            $deck | ConvertTo-Json -Depth 100 | Set-Content -LiteralPath $deckJsonPath -Encoding UTF8
            $libraryDecks.Add($deck)
            Add-Log "OK: $relativeSource ($slideCount slides)"
        } catch {
            Add-Log "ERROR: $relativeSource — $($_.Exception.Message)"
        } finally {
            Release-ComObject $slideCollection
            if ($null -ne $presentation) {
                try { $presentation.Close() } catch {}
                Release-ComObject $presentation
            }
            [GC]::Collect()
            [GC]::WaitForPendingFinalizers()
        }
    }
} catch {
    Add-Log "FATAL: $($_.Exception.Message)"
} finally {
    if ($null -ne $powerPoint) {
        try { $powerPoint.Quit() } catch {}
        Release-ComObject $powerPoint
    }
    [GC]::Collect()
    [GC]::WaitForPendingFinalizers()
}

$library = [pscustomobject]@{
    generatedAt = (Get-Date).ToUniversalTime().ToString('o')
    decks = @($libraryDecks)
}
$libraryJson = $library | ConvertTo-Json -Depth 100 -Compress
"window.CHURCH_LIBRARY = $libraryJson;" | Set-Content -LiteralPath $libraryPath -Encoding UTF8
$logLines | Set-Content -LiteralPath $logPath -Encoding UTF8
