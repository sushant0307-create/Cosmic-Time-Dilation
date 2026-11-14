# Cosmic Time Explorer 🌌

An interactive 3D browser simulator that demonstrates two forms of relativistic time dilation:

- **Velocity-based time dilation** from Special Relativity.
- **Gravitational time dilation** outside spherical, non-rotating bodies using a simplified Schwarzschild model.

The user can select a celestial body, adjust spacecraft speed and distance, start/pause a mission, toggle an illustrative orbital animation, and compare a distant reference clock with the spacecraft clock.

## Live demo
https://sushant0307-create.github.io/Cosmic-Time-Dilation/

## Features

- 3D star field, celestial bodies and spacecraft using Three.js.
- Earth, Moon, Mars, Jupiter, Sun, neutron star and a 10-solar-mass Schwarzschild black hole.
- Adjustable speed as a percentage of the speed of light.
- Adjustable spacecraft height above the selected body's reference radius.
- Reference clock, spacecraft proper-time clock and accumulated difference.
- Illustrative curved grid around the selected body.
- Responsive dashboard for desktop and mobile browsers.

## Run locally

### Option A: VS Code Live Server

1. Download or clone this repository.
2. Open the project folder in VS Code.
3. Install the **Live Server** extension.
4. Right-click `index.html` and choose **Open with Live Server**.

### Option B: Python local server

From the project folder, run:

```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

Do not open `index.html` directly as a `file://` URL. JavaScript modules and import maps work most reliably through a local web server.

## Project structure

```text
Cosmic-Time-Explorer/
├── index.html
├── style.css
├── README.md
├── .gitignore
└── src/
    ├── main.js
    ├── physics.js
    └── universe.js
```

## Physics model

For a static, spherical, non-rotating body, the Schwarzschild radius is

\[
r_s = \frac{2GM}{c^2}
\]

For a spacecraft outside the body, moving at local speed \(v\) relative to a local stationary observer, this educational model uses

\[
\frac{d\tau}{dt} =
\sqrt{1-\frac{r_s}{r}}
\sqrt{1-\frac{v^2}{c^2}}
\]

where:

- \(d\tau\) is the spacecraft's proper-time interval.
- \(dt\) is the distant Schwarzschild coordinate-time interval.
- \(r\) is the spacecraft's radial distance from the body's centre.
- \(G\) is the gravitational constant.
- \(M\) is the body's mass.
- \(c\) is the speed of light.

The two square-root factors represent gravitational and velocity time dilation. The speed is interpreted as measured by a local stationary observer.

## Important scientific limitations

This is an **educational visualization**, not a precision astrophysics or spacecraft-navigation tool.

- Bodies are treated as spherical and non-rotating.
- The model does not calculate a real spacecraft trajectory, acceleration, orbital stability or propulsion.
- The spacecraft's speed is supplied by the user; it is not derived from an orbit.
- The combined clock-rate expression assumes the local speed is measured by a stationary observer in Schwarzschild spacetime.
- The black-hole option represents a non-rotating Schwarzschild black hole. The spacecraft is kept outside the horizon.
- The curved grid is an illustrative, deliberately exaggerated visual analogy. It is not a numerical embedding of the full four-dimensional spacetime metric.
- Planet surface details, atmospheric effects, rotation, frame dragging and cosmological expansion are not modelled.

## Technology

- HTML5
- CSS3
- JavaScript ES modules
- [Three.js](https://threejs.org/) loaded from jsDelivr CDN

An internet connection is required to load Three.js and the optional Google Fonts when running the project.

## Future improvements

- Numerical spacecraft trajectories and orbital mechanics.
- A proper Schwarzschild metric visualization and geodesic paths.
- Rotating Kerr black-hole mode and frame dragging.
- Save/share mission settings.
- Automated physics unit tests.
- Educational mission challenges and comparison charts.

## Author
Sushant Yadav
