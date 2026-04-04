Add-Type -AssemblyName System.Drawing

$iconsDir = Join-Path (Get-Location) 'public\Icons'
if (-not (Test-Path -LiteralPath $iconsDir)) {
  New-Item -ItemType Directory -Path $iconsDir | Out-Null
}

function New-IconBitmap {
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
      WhitePen    = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 8)
      ThinPen     = New-Object System.Drawing.Pen([System.Drawing.Color]::White, 5)
      AccentPen   = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(245, 197, 24), 8)
    }

    try {
      & $DrawBody $drawContext
    } finally {
      $drawContext.WhiteBrush.Dispose()
      $drawContext.AccentBrush.Dispose()
      $drawContext.WhitePen.Dispose()
      $drawContext.ThinPen.Dispose()
      $drawContext.AccentPen.Dispose()
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

New-IconBitmap -Name 'home' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.FillPolygon($ctx.WhiteBrush, @(
    [System.Drawing.Point]::new(128, 60),
    [System.Drawing.Point]::new(68, 112),
    [System.Drawing.Point]::new(82, 112),
    [System.Drawing.Point]::new(82, 188),
    [System.Drawing.Point]::new(174, 188),
    [System.Drawing.Point]::new(174, 112),
    [System.Drawing.Point]::new(188, 112)
  ))
  $g.FillPolygon($ctx.WhiteBrush, @(
    [System.Drawing.Point]::new(128, 60),
    [System.Drawing.Point]::new(188, 112),
    [System.Drawing.Point]::new(174, 112),
    [System.Drawing.Point]::new(128, 74),
    [System.Drawing.Point]::new(82, 112),
    [System.Drawing.Point]::new(68, 112)
  ))
  $g.FillRectangle($ctx.AccentBrush, 116, 138, 24, 50)
  $g.FillRectangle($ctx.AccentBrush, 94, 118, 18, 18)
  $g.FillRectangle($ctx.AccentBrush, 144, 118, 18, 18)
}

New-IconBitmap -Name 'standings' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.DrawRectangle($ctx.WhitePen, 62, 78, 132, 108)
  $g.DrawLine($ctx.ThinPen, 62, 114, 194, 114)
  $g.DrawLine($ctx.ThinPen, 62, 146, 194, 146)
  $g.DrawLine($ctx.ThinPen, 104, 78, 104, 186)
  $g.DrawLine($ctx.ThinPen, 146, 78, 146, 186)
  $g.FillEllipse($ctx.AccentBrush, 38, 150, 44, 44)
  $g.DrawEllipse($ctx.WhitePen, 38, 150, 44, 44)
}

New-IconBitmap -Name 'games' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.DrawRectangle($ctx.WhitePen, 54, 84, 148, 90)
  $g.DrawLine($ctx.ThinPen, 128, 84, 128, 174)
  $g.DrawLine($ctx.ThinPen, 54, 114, 202, 114)
  $g.FillEllipse($ctx.AccentBrush, 86, 126, 22, 22)
  $g.FillEllipse($ctx.AccentBrush, 148, 126, 22, 22)
  $g.DrawArc($ctx.WhitePen, 74, 182, 108, 28, 10, 160)
}

New-IconBitmap -Name 'players' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.FillEllipse($ctx.WhiteBrush, 94, 62, 68, 68)
  $g.DrawArc($ctx.WhitePen, 70, 112, 116, 76, 15, 150)
  $g.DrawRectangle($ctx.ThinPen, 54, 152, 48, 34)
  $g.DrawRectangle($ctx.ThinPen, 154, 152, 48, 34)
  $g.FillEllipse($ctx.AccentBrush, 62, 160, 12, 12)
  $g.FillEllipse($ctx.AccentBrush, 162, 160, 12, 12)
}

New-IconBitmap -Name 'stats' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.DrawLine($ctx.WhitePen, 64, 186, 194, 186)
  $g.FillRectangle($ctx.WhiteBrush, 76, 134, 22, 52)
  $g.FillRectangle($ctx.WhiteBrush, 116, 110, 22, 76)
  $g.FillRectangle($ctx.WhiteBrush, 156, 86, 22, 100)
  $g.DrawLines($ctx.AccentPen, @(
    [System.Drawing.Point]::new(76, 126),
    [System.Drawing.Point]::new(127, 100),
    [System.Drawing.Point]::new(167, 76)
  ))
  $g.FillEllipse($ctx.AccentBrush, 70, 120, 12, 12)
  $g.FillEllipse($ctx.AccentBrush, 121, 94, 12, 12)
  $g.FillEllipse($ctx.AccentBrush, 161, 70, 12, 12)
}

New-IconBitmap -Name 'compare' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.DrawRectangle($ctx.WhitePen, 52, 92, 56, 78)
  $g.DrawRectangle($ctx.WhitePen, 148, 92, 56, 78)
  $g.DrawLine($ctx.ThinPen, 70, 118, 92, 118)
  $g.DrawLine($ctx.ThinPen, 166, 118, 188, 118)
  $g.DrawLine($ctx.ThinPen, 70, 138, 92, 138)
  $g.DrawLine($ctx.ThinPen, 166, 138, 188, 138)
  $g.DrawArc($ctx.AccentPen, 90, 88, 76, 54, 215, 110)
  $g.DrawArc($ctx.AccentPen, 90, 124, 76, 54, 35, 110)
}

New-IconBitmap -Name 'admin' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.FillEllipse($ctx.AccentBrush, 104, 104, 48, 48)
  $g.DrawEllipse($ctx.WhitePen, 86, 86, 84, 84)
  foreach ($point in @(
    [System.Drawing.Point]::new(128, 60),
    [System.Drawing.Point]::new(128, 196),
    [System.Drawing.Point]::new(60, 128),
    [System.Drawing.Point]::new(196, 128),
    [System.Drawing.Point]::new(82, 82),
    [System.Drawing.Point]::new(174, 82),
    [System.Drawing.Point]::new(82, 174),
    [System.Drawing.Point]::new(174, 174)
  )) {
    $g.FillEllipse($ctx.WhiteBrush, $point.X - 10, $point.Y - 10, 20, 20)
  }
}

New-IconBitmap -Name 'venues' -DrawBody {
  param($ctx)
  $g = $ctx.Graphics
  $g.DrawArc($ctx.WhitePen, 44, 58, 168, 132, 198, 144)
  $g.DrawArc($ctx.WhitePen, 58, 74, 140, 100, 198, 144)
  $g.DrawArc($ctx.WhitePen, 72, 90, 112, 68, 198, 144)
  $g.DrawLine($ctx.WhitePen, 54, 168, 202, 168)
  $g.DrawLine($ctx.ThinPen, 76, 146, 180, 146)
  $g.DrawLine($ctx.ThinPen, 92, 126, 164, 126)
  $g.FillRectangle($ctx.WhiteBrush, 58, 174, 140, 16)
  $g.FillEllipse($ctx.AccentBrush, 106, 110, 44, 26)
  $g.FillEllipse($ctx.AccentBrush, 112, 184, 32, 14)
  $g.FillRectangle($ctx.WhiteBrush, 38, 148, 18, 40)
  $g.FillRectangle($ctx.WhiteBrush, 200, 148, 18, 40)
  $g.FillEllipse($ctx.WhiteBrush, 34, 136, 26, 18)
  $g.FillEllipse($ctx.WhiteBrush, 196, 136, 26, 18)
}

Get-ChildItem -Path $iconsDir -Filter '*-nav-96.png' |
  Where-Object { $_.BaseName -in @('home-nav-96', 'standings-nav-96', 'games-nav-96', 'players-nav-96', 'stats-nav-96', 'compare-nav-96', 'admin-nav-96', 'venues-nav-96') } |
  Select-Object Name, Length
