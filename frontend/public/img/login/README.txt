Login background
================

desktop.jpg   landscape, shown above ~1024 px wide   (LoginPage.tsx)
mobile.jpg    portrait,  shown below ~1024 px wide
ambient.svg   generated fallback, used if a .jpg is missing / fails to load

To swap the photo: replace desktop.jpg / mobile.jpg here (keep the names) and
refresh /login. No code change. Keep them dark and moody with a clear warm
light source — the page lays its own warm scrim + film grain on top and
darkens both side columns for the brand text, so don't pre-darken heavily.

Target export: progressive JPEG, ~q80.
  desktop ~2400 x 1350, < 500 KB
  mobile  ~1400 x 2490, < 350 KB
