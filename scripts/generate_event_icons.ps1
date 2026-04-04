Add-Type -AssemblyName System.Drawing

$iconsDir = Join-Path (Get-Location) 'public\Icons'
if (-not (Test-Path -LiteralPath $iconsDir)) {
  New-Item -ItemType Directory -Path $iconsDir | Out-Null
}

function New-EventIconBitmap {
  param(
    [scriptblock]$DrawBody,
    [string]$Name
  )

  $size = 256
  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)

  try {
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.Clear([System.Drawing.Color]::Transparent)

    $outerRect = New-Object System.Drawing.Rectangle(8, 8, 240, 240)
    $outerPath = New-Object System.Drawing.Drawing2D.GraphicsPath
    $outerPath.AddEllipse($outerRect)

    $gradient = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      $outerRect,
      [System.Drawing.Color]::FromArgb(127, 29, 29),
      [System.Drawing.Color]::FromArgb(17, 24, 39),
      45
    )

    try {
      $graphics.FillPath($gradient, $outerPath)
    } finally {
      $gradient.Dispose()
    }

    $ringPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(245, 197, 24), 8)
    try {
      $graphics.DrawPath($ringPen, $outerPath)
    } finally {
      $ringPen.Dispose()
      $outerPath.Dispose()
    }

    $drawContext = [pscustomobject]@{
      Graphics    = $graphics
      WhiteBrush  = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
      AccentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 197, 24))
      RedBrush    = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(220, 38, 38))
      YellowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(250, 204, 21))
      WhitePen    = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 8)
      ThinPen     = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 5)
      AccentPen   = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(245, 197, 24), 8)
      RedPen      = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 38, 38), 8)
      YellowPen   = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(250, 204, 21), 8)
    }

    try {
      & $DrawBody $drawContext
    } finally {
      $drawContext.WhiteBrush.Dispose()
      $drawContext.AccentBrush.Dispose()
      $drawContext.RedBrush.Dispose()
      $drawContext.YellowBrush.Dispose()
      $drawContext.WhitePen.Dispose()
      $drawContext.ThinPen.Dispose()
      $drawContext.AccentPen.Dispose()
      $drawContext.RedPen.Dispose()
      $drawContext.YellowPen.Dispose()
    }
  } finally {
    $graphics.Dispose()
  }

  $iconPath = Join-Path $iconsDir "$Name-icon-256.png"
  $bitmap.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $bitmap.Dispose()

  $navBitmap = New-Object System.Drawing.Bitmap(96, 96)
  $navGraphics = [System.Drawing.Graphics]::FromImage($navBitmap)
  try {
    $navGraphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $navGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $navGraphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $navGraphics.Clear([System.Drawing.Color]::Transparent)
    $source = [System.Drawing.Image]::FromFile($iconPath)
    try {
      $navGraphics.DrawImage($source, 0, 0, 96, 96)
    } finally {
      $source.Dispose()
    }
  } finally {
    $navGraphics.Dispose()
  }

  $navPath = Join-Path $iconsDir "$Name-nav-96.png"
  $navBitmap.Save($navPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $navBitmap.Dispose()
}

New-EventIconBitmap -Name 'event-goal' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.FillEllipse($ctx.WhiteBrush, 74, 74, 108, 108)
  $g.DrawEllipse($ctx.AccentPen, 74, 74, 108, 108)
  $g.DrawPolygon($ctx.RedPen, @(
    [System.Drawing.Point]::new(128, 96),
    [System.Drawing.Point]::new(142, 122),
    [System.Drawing.Point]::new(170, 128),
    [System.Drawing.Point]::new(148, 146),
    [System.Drawing.Point]::new(152, 174),
    [System.Drawing.Point]::new(128, 160),
    [System.Drawing.Point]::new(104, 174),
    [System.Drawing.Point]::new(108, 146),
    [System.Drawing.Point]::new(86, 128),
    [System.Drawing.Point]::new(114, 122)
  ))
  $g.DrawArc($ctx.WhitePen, 40, 156, 72, 44, 210, 110)
  $g.DrawArc($ctx.WhitePen, 144, 156, 72, 44, 320, 110)
}

New-EventIconBitmap -Name 'event-assist' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.DrawLine($ctx.WhitePen, 66, 178, 118, 128)
  $g.FillEllipse($ctx.WhiteBrush, 56, 170, 22, 22)
  $g.FillEllipse($ctx.WhiteBrush, 108, 118, 22, 22)
  $g.FillEllipse($ctx.WhiteBrush, 162, 72, 26, 26)
  $g.DrawArc($ctx.AccentPen, 92, 72, 88, 88, 30, 250)
  $g.DrawLine($ctx.AccentPen, 156, 82, 186, 82)
  $g.DrawLine($ctx.AccentPen, 186, 82, 186, 112)
}

New-EventIconBitmap -Name 'event-red-card' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $card = New-Object System.Drawing.Drawing2D.GraphicsPath
  try {
    $card.AddArc(82, 62, 22, 22, 180, 90)
    $card.AddArc(152, 62, 22, 22, 270, 90)
    $card.AddArc(152, 178, 22, 22, 0, 90)
    $card.AddArc(82, 178, 22, 22, 90, 90)
    $card.CloseFigure()
    $g.FillPath($ctx.RedBrush, $card)
    $g.DrawPath($ctx.WhitePen, $card)
  } finally {
    $card.Dispose()
  }
}

New-EventIconBitmap -Name 'event-yellow-card' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $card = New-Object System.Drawing.Drawing2D.GraphicsPath
  try {
    $card.AddArc(82, 62, 22, 22, 180, 90)
    $card.AddArc(152, 62, 22, 22, 270, 90)
    $card.AddArc(152, 178, 22, 22, 0, 90)
    $card.AddArc(82, 178, 22, 22, 90, 90)
    $card.CloseFigure()
    $g.FillPath($ctx.YellowBrush, $card)
    $g.DrawPath($ctx.WhitePen, $card)
  } finally {
    $card.Dispose()
  }
}

New-EventIconBitmap -Name 'event-sub-out' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.DrawEllipse($ctx.WhitePen, 74, 64, 48, 48)
  $g.DrawLine($ctx.WhitePen, 98, 112, 98, 162)
  $g.DrawLine($ctx.WhitePen, 98, 126, 72, 148)
  $g.DrawLine($ctx.WhitePen, 98, 126, 124, 148)
  $g.DrawLine($ctx.RedPen, 144, 128, 202, 128)
  $g.DrawLine($ctx.RedPen, 182, 108, 202, 128)
  $g.DrawLine($ctx.RedPen, 182, 148, 202, 128)
}

New-EventIconBitmap -Name 'event-sub-in' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.DrawEllipse($ctx.WhitePen, 136, 64, 48, 48)
  $g.DrawLine($ctx.WhitePen, 160, 112, 160, 162)
  $g.DrawLine($ctx.WhitePen, 160, 126, 134, 148)
  $g.DrawLine($ctx.WhitePen, 160, 126, 186, 148)
  $g.DrawLine($ctx.AccentPen, 54, 128, 112, 128)
  $g.DrawLine($ctx.AccentPen, 54, 128, 74, 108)
  $g.DrawLine($ctx.AccentPen, 54, 128, 74, 148)
}

New-EventIconBitmap -Name 'event-injury' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.DrawEllipse($ctx.WhitePen, 84, 58, 40, 40)
  $g.DrawLine($ctx.WhitePen, 104, 98, 104, 146)
  $g.DrawLine($ctx.WhitePen, 104, 112, 80, 136)
  $g.DrawLine($ctx.WhitePen, 104, 112, 126, 130)
  $g.DrawLine($ctx.WhitePen, 104, 146, 84, 184)
  $g.DrawLine($ctx.WhitePen, 104, 146, 124, 184)
  $bolt = New-Object System.Drawing.Drawing2D.GraphicsPath
  try {
    $bolt.AddPolygon(@(
      [System.Drawing.Point]::new(144, 70),
      [System.Drawing.Point]::new(118, 128),
      [System.Drawing.Point]::new(144, 128),
      [System.Drawing.Point]::new(128, 186),
      [System.Drawing.Point]::new(176, 116),
      [System.Drawing.Point]::new(148, 116)
    ))
    $g.FillPath($ctx.RedBrush, $bolt)
    $g.DrawPath($ctx.WhitePen, $bolt)
  } finally {
    $bolt.Dispose()
  }
}

Get-ChildItem -Path $iconsDir -Filter 'event-*-nav-96.png' | Select-Object Name, Length
