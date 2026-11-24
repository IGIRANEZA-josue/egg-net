"use client";
// Device laboratory: shows the real EggHub site inside a phone frame.
//
// The pages are not re-created or mocked. The frame is an <iframe> pointing at
// the live route, sized to a real phone, so it runs the same CSS media queries,
// the same navbar and the same data as an actual handset.
//
// A measuring script runs inside each frame and reports the page's scroll width
// back here, so "no horizontal scrolling" is checked by the browser rather than
// assumed. "Check every page" sweeps all pages on all phone sizes, one at a
// time, filling the table below.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";

type Device = { id: string; name: string; width: number; height: number; note: string };

const DEVICES: Device[] = [
  { id: "se", name: "iPhone SE", width: 320, height: 568, note: "small phone" },
  { id: "android", name: "Android compact", width: 360, height: 740, note: "360 × 740" },
  { id: "iphone", name: "iPhone 13 / 14", width: 390, height: 844, note: "most common" },
  { id: "promax", name: "iPhone Pro Max", width: 430, height: 932, note: "large phone" },
  { id: "tablet", name: "iPad mini", width: 768, height: 1024, note: "tablet" },
];

type Screen = { path: string; label: string; group: "Public" | "Customer" | "Admin" };

const SCREENS: Screen[] = [
  { path: "/", label: "Home", group: "Public" },
  { path: "/products", label: "Products", group: "Public" },
  { path: "/products/1", label: "Product detail", group: "Public" },
  { path: "/about", label: "About", group: "Public" },
  { path: "/contact", label: "Contact", group: "Public" },
  { path: "/login", label: "Login", group: "Public" },
  { path: "/register", label: "Register", group: "Public" },
  { path: "/forgot-password", label: "Forgot password", group: "Public" },
  { path: "/reset-password", label: "Reset password", group: "Public" },
  { path: "/cart", label: "Cart", group: "Customer" },
  { path: "/checkout", label: "Checkout", group: "Customer" },
  { path: "/dashboard", label: "My account", group: "Customer" },
  { path: "/profile", label: "Profile", group: "Customer" },
  { path: "/orders", label: "My orders", group: "Customer" },
  { path: "/orders/1", label: "Order detail", group: "Customer" },
  { path: "/orders/1/invoice", label: "Invoice", group: "Customer" },
  { path: "/admin", label: "Admin overview", group: "Admin" },
  { path: "/admin/products", label: "Admin products", group: "Admin" },
  { path: "/admin/products/new", label: "Add product", group: "Admin" },
  { path: "/admin/orders", label: "Admin orders", group: "Admin" },
  { path: "/admin/customers", label: "Admin customers", group: "Admin" },
  { path: "/admin/promotions", label: "Admin promotions", group: "Admin" },
  { path: "/admin/sales", label: "Admin sales", group: "Admin" },
];

type Result = { over: number; offenders: string[] };
type MeasureMessage = { __eggMeasure?: boolean; over?: number; offenders?: string[] };

// Runs inside the iframe and posts the measured overflow to this page.
const MEASURE = `(function(){
  try {
    var d = document.documentElement;
    var width = d.clientWidth;
    var body = document.body ? document.body.scrollWidth : 0;
    var over = Math.max(d.scrollWidth, body) - width;
    var offenders = [];
    if (over > 1) {
      var nodes = document.querySelectorAll("body *");
      for (var i = 0; i < nodes.length && offenders.length < 6; i++) {
        var el = nodes[i];
        var r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > width + 1 || r.left < -1) {
          var tag = el.tagName.toLowerCase();
          var cls = typeof el.className === "string" && el.className
            ? "." + el.className.trim().split(/\\s+/).slice(0, 2).join(".")
            : "";
          offenders.push(tag + cls);
        }
      }
    }
    parent.postMessage({ __eggMeasure: true, over: Math.max(0, Math.round(over)), offenders: offenders }, "*");
  } catch (err) { /* not our document: ignore */ }
})();`;

const SWEEP_QUEUE = DEVICES.flatMap((device) => SCREENS.map((screen) => ({ device, screen })));
const TOTAL_STEPS = SWEEP_QUEUE.length;

function keyOf(deviceId: string, path: string) {
  return `${deviceId}|${path}`;
}

export default function DevicesPage() {
  const [deviceId, setDeviceId] = useState("iphone");
  const [screenPath, setScreenPath] = useState("/");
  const [result, setResult] = useState<Result | null>(null);
  const [results, setResults] = useState<Record<string, Result>>({});
  const [onlyGroup, setOnlyGroup] = useState<"All" | "Public" | "Customer" | "Admin">("All");

  // Sweep state: which of the 105 page/phone combinations is being checked.
  const [sweepIndex, setSweepIndex] = useState(-1);
  const [sweepDone, setSweepDone] = useState(0);

  // Scale the phone down so it fits the available width on small screens.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const [stageWidth, setStageWidth] = useState(0);

  const phoneRef = useRef<HTMLIFrameElement | null>(null);
  const probeRef = useRef<HTMLIFrameElement | null>(null);
  const handledStep = useRef(-1);

  const device = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[2];
  const sweepStep = sweepIndex >= 0 ? SWEEP_QUEUE[sweepIndex] : null;
  const stageScale = stageWidth > 0 ? Math.min(1, (stageWidth - 8) / device.width) : 1;

  /* ---------- responsive stage width ---------- */
  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const next = Math.round(entries[0].contentRect.width);
      setStageWidth((prev) => (prev === next ? prev : next));
    });
    observer.observe(node);
    setStageWidth(Math.round(node.getBoundingClientRect().width));
    return () => observer.disconnect();
  }, []);

  /* ---------- measurements coming back from the frames ---------- */
  const handleMessage = useCallback((event: MessageEvent) => {
    const data = event.data as MeasureMessage | null;
    if (!data || data.__eggMeasure !== true) return;
    const over = typeof data.over === "number" ? Math.max(0, Math.round(data.over)) : 0;
    const offenders = Array.isArray(data.offenders) ? data.offenders.slice(0, 6) : [];

    if (phoneRef.current && event.source === phoneRef.current.contentWindow) {
      setResult({ over, offenders });
      return;
    }

    if (probeRef.current && event.source === probeRef.current.contentWindow && sweepStep) {
      if (handledStep.current === sweepIndex) return;
      handledStep.current = sweepIndex;
      const key = keyOf(sweepStep.device.id, sweepStep.screen.path);
      setResults((prev) => ({ ...prev, [key]: { over, offenders } }));
      setSweepDone((prev) => prev + 1);
      setSweepIndex((prev) => (prev + 1 < TOTAL_STEPS ? prev + 1 : -1));
      if (over > 1) console.warn(`[devices] ${key} overflows by ${over}px`, offenders);
    }
  }, [sweepStep, sweepIndex]);

  useEffect(() => {
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [handleMessage]);

  /* ---------- safety net: never hang on a frame that will not report ---------- */
  useEffect(() => {
    if (sweepIndex < 0) return;
    const timer = window.setTimeout(() => {
      if (handledStep.current === sweepIndex) return;
      handledStep.current = sweepIndex;
      setSweepDone((prev) => prev + 1);
      setSweepIndex((prev) => (prev + 1 < TOTAL_STEPS ? prev + 1 : -1));
    }, 7000);
    return () => window.clearTimeout(timer);
  }, [sweepIndex]);

  const startSweep = () => {
    handledStep.current = -1;
    setResults({});
    setSweepDone(0);
    setSweepIndex(0);
  };
  const stopSweep = () => setSweepIndex(-1);

  const chooseDevice = (id: string) => {
    setDeviceId(id);
    setResult(null);
  };
  const chooseScreen = (path: string) => {
    setScreenPath(path);
    setResult(null);
  };

  const visibleScreens = useMemo(
    () => (onlyGroup === "All" ? SCREENS : SCREENS.filter((s) => s.group === onlyGroup)),
    [onlyGroup]
  );

  const checked = Object.keys(results).length;
  const overflowCount = Object.values(results).filter((r) => r.over > 1).length;
  const sweeping = sweepIndex >= 0;
  const phoneFits = result !== null && result.over <= 1;

  return (
    <div className="page container devices-page">
      <header className="devices-head">
        <p className="eyebrow">Responsive check</p>
        <h1 className="page-title">See EggHub on a phone</h1>
        <p className="muted devices-intro">
          This is the real website, not a picture of it. The frame below loads the live page at a real phone width,
          so every layout rule behaves exactly as it will on a handset. Use the menus to walk through the whole site.
        </p>
      </header>

      {/* ---------- controls ---------- */}
      <div className="devices-toolbar">
        <div className="devices-field">
          <label htmlFor="device-select">Device</label>
          <select id="device-select" value={deviceId} onChange={(e) => chooseDevice(e.target.value)}>
            {DEVICES.map((d) => (
              <option key={d.id} value={d.id}>{d.name} · {d.width}×{d.height}</option>
            ))}
          </select>
        </div>
        <div className="devices-field">
          <label htmlFor="screen-select">Page</label>
          <select id="screen-select" value={screenPath} onChange={(e) => chooseScreen(e.target.value)}>
            {(["Public", "Customer", "Admin"] as const).map((group) => (
              <optgroup key={group} label={group}>
                {SCREENS.filter((s) => s.group === group).map((s) => (
                  <option key={s.path} value={s.path}>{s.label} — {s.path}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="devices-readout" role="status" aria-live="polite">
          {result === null ? (
            <span className="status-dot checking">measuring…</span>
          ) : result.over > 1 ? (
            <span className="status-dot overflow">scrolls {result.over}px</span>
          ) : (
            <span className="status-dot ok">fits {device.width}px</span>
          )}
          <Link href={screenPath} className="devices-open-link">Open full size ↗</Link>
        </div>
      </div>

      {result && result.over > 1 && (
        <p className="devices-alert" role="alert">
          <strong>This page is wider than the screen.</strong> Widest elements:{" "}
          <code>{result.offenders.join(", ") || "unknown"}</code>
        </p>
      )}

      {/* ---------- the phone ---------- */}
      <div className="device-stage" ref={stageRef}>
        <div className="device-wrap">
          <div
            className="device-scaler"
            style={{ width: device.width * stageScale, height: device.height * stageScale }}
          >
            <div
              className="phone-frame"
              style={{ width: device.width, height: device.height, transform: `scale(${stageScale})` }}
            >
              <div className="phone-speaker" aria-hidden="true" />
              <div className="phone-screen" style={{ width: device.width - 24, height: device.height - 48 }}>
                <iframe
                  ref={phoneRef}
                  key={`${device.id}-${screenPath}`}
                  title={`${device.name} preview of ${screenPath}`}
                  src={screenPath}
                  width={device.width}
                  height={device.height}
                  onLoad={(event) => {
                    const frame = event.currentTarget;
                    window.setTimeout(() => {
                      try {
                        (frame.contentWindow as unknown as { eval: (code: string) => void } | null)?.eval(MEASURE);
                      } catch {
                        /* ignore */
                      }
                    }, 600);
                  }}
                />
              </div>
              <div className="phone-home" aria-hidden="true" />
            </div>
          </div>
          <div className="device-caption">
            <strong>{device.name}</strong>
            <span>
              {device.width} × {device.height} · {device.note}
              {stageScale < 0.995 ? ` · shown at ${Math.round(stageScale * 100)}%` : ""}
            </span>
          </div>
        </div>

        <div className="device-side">
          <h2 className="devices-side-title">Try another size</h2>
          <div className="device-others">
            {DEVICES.map((d) => (
              <button
                key={d.id}
                type="button"
                className={`device-mini ${d.id === deviceId ? "active" : ""}`}
                onClick={() => chooseDevice(d.id)}
                aria-pressed={d.id === deviceId}
              >
                <span
                  className="device-mini-screen"
                  style={{ width: Math.round(d.width / 6), height: Math.round(d.height / 6) }}
                  aria-hidden="true"
                />
                <span className="device-mini-name">{d.name}</span>
                <span className="device-mini-size">{d.width}×{d.height}</span>
              </button>
            ))}
          </div>

          <h2 className="devices-side-title">Quick pages</h2>
          <div className="devices-quick">
            {SCREENS.filter((s) => s.group === "Public").map((s) => (
              <button
                key={s.path}
                type="button"
                className={`chip ${s.path === screenPath ? "active" : ""}`}
                onClick={() => chooseScreen(s.path)}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="devices-summary">
            <p className="muted">
              <strong>{checked} of {TOTAL_STEPS}</strong> page × phone combinations measured
              {checked > 0 ? ` · ${checked - overflowCount} fit · ${overflowCount} overflow` : ""}.
            </p>
            <div className="devices-actions">
              {sweeping ? (
                <button type="button" className="btn" onClick={stopSweep}>Stop checking</button>
              ) : (
                <button type="button" className="btn" onClick={startSweep} disabled={checked > 0 && sweepDone >= TOTAL_STEPS}>
                  {checked > 0 && sweepDone >= TOTAL_STEPS ? "All combinations checked" : "Check every page"}
                </button>
              )}
            </div>
            {sweeping && (
              <div className="devices-progress" aria-hidden="true">
                <div style={{ width: `${Math.round((sweepDone / TOTAL_STEPS) * 100)}%` }} />
              </div>
            )}
            {sweeping && sweepStep && (
              <p className="devices-progress-text">
                Checking <strong>{sweepStep.screen.label}</strong> at {sweepStep.device.width}px
                ({sweepDone + 1}/{TOTAL_STEPS})
              </p>
            )}
          </div>
        </div>
      </div>

      {/* ---------- matrix ---------- */}
      <section className="devices-matrix">
        <div className="devices-matrix-head">
          <h2 className="section-title">Every page, every phone</h2>
          <div className="segmented" role="group" aria-label="Filter pages">
            {(["All", "Public", "Customer", "Admin"] as const).map((group) => (
              <button
                key={group}
                type="button"
                className={onlyGroup === group ? "active" : ""}
                onClick={() => setOnlyGroup(group)}
              >
                {group}
              </button>
            ))}
          </div>
        </div>
        <p className="muted devices-matrix-note">
          Tap a page name to load it in the phone. Press <strong>Check every page</strong> above to measure all
          combinations; results fill in as it runs. Customer and admin pages need an account — without one they show
          the site&apos;s own sign-in prompt, which is also worth checking.
        </p>

        <div className="table-wrap">
          <table className="devices-table">
            <thead>
              <tr>
                <th>Page</th>
                {DEVICES.map((d) => <th key={d.id}>{d.width}px</th>)}
                <th aria-label="Open full size" />
              </tr>
            </thead>
            <tbody>
              {visibleScreens.map((s) => (
                <tr key={s.path} className={s.path === screenPath ? "selected" : ""}>
                  <td>
                    <button type="button" className="devices-link" onClick={() => chooseScreen(s.path)}>
                      {s.label}
                    </button>
                    <span className="devices-path">{s.path}</span>
                  </td>
                  {DEVICES.map((d) => {
                    const hit = results[keyOf(d.id, s.path)];
                    return (
                      <td key={d.id} className="devices-status-cell">
                        {hit ? (
                          <span
                            className={`status-dot ${hit.over > 1 ? "overflow" : "ok"}`}
                            title={hit.over > 1 ? `Overflows by ${hit.over}px: ${hit.offenders.join(", ")}` : "Fits the screen width"}
                          >
                            {hit.over > 1 ? `${hit.over}px` : "✓"}
                          </span>
                        ) : (
                          <span className="status-dot idle" title="Not measured yet">–</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="devices-status-cell">
                    <Link href={s.path} className="devices-open" aria-label={`Open ${s.label} full size`}>↗</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="devices-legend muted">
          <span className="status-dot ok">✓</span> fits the width
          <span className="devices-legend-sep">·</span>
          <span className="status-dot overflow">px</span> scrolls sideways by that many pixels
          <span className="devices-legend-sep">·</span>
          <span className="status-dot idle">–</span> not measured yet
        </p>
      </section>

      {/* The sweep runs in one hidden frame, one page at a time. */}
      <div className="devices-probe" aria-hidden="true" inert>
        {sweeping && sweepStep && (
          <iframe
            ref={probeRef}
            key={sweepIndex}
            title="measuring"
            src={sweepStep.screen.path}
            width={sweepStep.device.width}
            height={sweepStep.device.height}
            tabIndex={-1}
            onLoad={(event) => {
              const frame = event.currentTarget;
              window.setTimeout(() => {
                try {
                  (frame.contentWindow as unknown as { eval: (code: string) => void } | null)?.eval(MEASURE);
                } catch {
                  /* ignore */
                }
              }, 450);
            }}
          />
        )}
      </div>
    </div>
  );
}
