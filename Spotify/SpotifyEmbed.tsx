import { useEffect, useState, useRef } from "react"
import { addPropertyControls, ControlType } from "framer"

/**
 * SpotifyNowPlaying — Spotify API via Cloudflare Worker
 * Deterministic per-song animation (tight, rhythmic, consistent).
 *
 * @framerSupportedLayoutWidth any
 * @framerSupportedLayoutHeight any
 */
export default function SpotifyNowPlaying(props) {
    const {
        workerUrl,
        accentColor,
        backgroundColor,
        textColor,
        mutedColor,
        barCount,
        pollInterval,
    } = props

    const [data, setData] = useState(null)
    const [progress, setProgress] = useState(0)
    const progressBaseRef = useRef({ serverProgress: 0, fetchedAt: 0 })

    useEffect(() => {
        if (!workerUrl) return
        let cancelled = false

        const poll = async () => {
            try {
                const res = await fetch(workerUrl, { cache: "no-store" })
                const json = await res.json()
                if (cancelled) return
                setData(json)
                if (json.is_playing && typeof json.progress_ms === "number") {
                    progressBaseRef.current = {
                        serverProgress: json.progress_ms,
                        fetchedAt: Date.now(),
                    }
                }
            } catch (err) {
                console.error("[Spotify] poll failed:", err)
            }
        }

        poll()
        const interval = setInterval(poll, pollInterval * 1000)
        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [workerUrl, pollInterval])

    useEffect(() => {
        if (!data?.is_playing) {
            setProgress(0)
            return
        }
        const tick = () => {
            const { serverProgress, fetchedAt } = progressBaseRef.current
            const elapsed = Date.now() - fetchedAt
            const currentMs = serverProgress + elapsed
            const pct = Math.min(
                100,
                Math.max(0, (currentMs / data.duration_ms) * 100)
            )
            setProgress(pct)
        }
        tick()
        const id = setInterval(tick, 500)
        return () => clearInterval(id)
    }, [data])

    const isPlaying = data?.is_playing
    const fmt = (ms) => {
        const s = Math.floor(ms / 1000)
        return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`
    }
    const elapsedMs = isPlaying
        ? progressBaseRef.current.serverProgress +
          (Date.now() - progressBaseRef.current.fetchedAt)
        : 0

    // ---- Deterministic animation from track ID ----
    // Simple hash: each character adds to a running integer
    const hash = (str) => {
        let h = 0
        for (let i = 0; i < (str?.length ?? 0); i++) {
            h = (h * 31 + str.charCodeAt(i)) >>> 0
        }
        return h
    }

    const trackHash = hash(data?.track_id ?? "")

    // Derive BPM-like speed: between 85 and 155 based on hash
    const pseudoBpm = 85 + (trackHash % 70)
    // Derive energy (affects bar height swing): between 0.4 and 0.95
    const pseudoEnergy = 0.4 + ((trackHash >> 8) % 100) / 180
    // If we *did* get a real BPM from backend someday, use it instead
    const realBpm = data?.bpm > 0 ? data.bpm : null
    const effectiveBpm = realBpm ?? pseudoBpm

    const beatDuration = 60 / effectiveBpm
    const barAnimDuration = beatDuration / 2 // eighth notes

    const minH = Math.round(25 - pseudoEnergy * 15)
    const maxH = Math.round(45 + pseudoEnergy * 55)

    return (
        <div
            style={{
                width: "100%",
                height: "100%",
                background: backgroundColor,
                borderRadius: 12,
                padding: 16,
                display: "flex",
                alignItems: "center",
                gap: 14,
                fontFamily:
                    "-apple-system, BlinkMacSystemFont, 'Inter', sans-serif",
                boxSizing: "border-box",
                overflow: "hidden",
            }}
        >
            <div
                style={{
                    width: 64,
                    height: 64,
                    flexShrink: 0,
                    borderRadius: 8,
                    background: mutedColor,
                    backgroundImage:
                        isPlaying && data.album_art_url
                            ? `url(${data.album_art_url})`
                            : "none",
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    position: "relative",
                }}
            >
                {!isPlaying && (
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: textColor,
                            opacity: 0.4,
                            fontSize: 24,
                        }}
                    >
                        ♫
                    </div>
                )}
            </div>

            <div
                style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                }}
            >
                <div
                    style={{
                        fontSize: 10,
                        textTransform: "uppercase",
                        letterSpacing: 1.2,
                        color: mutedColor,
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                    }}
                >
                    <span
                        style={{
                            width: 6,
                            height: 6,
                            borderRadius: "50%",
                            background: isPlaying ? accentColor : mutedColor,
                            display: "inline-block",
                            boxShadow: isPlaying
                                ? `0 0 8px ${accentColor}`
                                : "none",
                        }}
                    />
                    {isPlaying ? "Now Playing" : "Not Listening"}
                </div>

                <div
                    style={{
                        fontSize: 14,
                        fontWeight: 600,
                        color: textColor,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {isPlaying ? data.song : "Silence"}
                </div>

                <div
                    style={{
                        fontSize: 12,
                        color: mutedColor,
                        whiteSpace: "nowrap",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                    }}
                >
                    {isPlaying ? data.artist : "—"}
                </div>

                <div
                    style={{
                        display: "flex",
                        alignItems: "flex-end",
                        gap: 2,
                        height: 18,
                        marginTop: 2,
                    }}
                >
                    {Array.from({ length: barCount }).map((_, i) => {
                        // Use hash to give each bar its own phase offset
                        const phase =
                            (((trackHash + i * 97) % 100) / 100) *
                            barAnimDuration
                        const animIdx = (trackHash + i) % 5
                        return (
                            <div
                                key={i}
                                style={{
                                    flex: 1,
                                    background: isPlaying
                                        ? accentColor
                                        : mutedColor,
                                    opacity: isPlaying ? 1 : 0.3,
                                    borderRadius: 1,
                                    animation: isPlaying
                                        ? `sp-bar-${animIdx} ${barAnimDuration}s steps(8, end) ${phase}s infinite alternate`
                                        : "none",
                                    height: isPlaying ? "100%" : "30%",
                                    transformOrigin: "bottom",
                                }}
                            />
                        )
                    })}
                </div>

                {isPlaying && (
                    <div style={{ marginTop: 4 }}>
                        <div
                            style={{
                                height: 3,
                                background: mutedColor,
                                borderRadius: 2,
                                overflow: "hidden",
                                opacity: 0.4,
                            }}
                        >
                            <div
                                style={{
                                    height: "100%",
                                    width: `${progress}%`,
                                    background: accentColor,
                                    transition: "width 0.5s linear",
                                }}
                            />
                        </div>
                        <div
                            style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: 10,
                                color: mutedColor,
                                marginTop: 3,
                                fontVariantNumeric: "tabular-nums",
                            }}
                        >
                            <span>{fmt(elapsedMs)}</span>
                            <span>{fmt(data.duration_ms)}</span>
                        </div>
                    </div>
                )}
            </div>

            <style>{`
                @keyframes sp-bar-0 { 0% { height: ${minH}%; } 100% { height: ${maxH}%; } }
                @keyframes sp-bar-1 { 0% { height: ${maxH - 10}%; } 100% { height: ${minH + 10}%; } }
                @keyframes sp-bar-2 { 0% { height: ${minH + 5}%; } 100% { height: ${maxH}%; } }
                @keyframes sp-bar-3 { 0% { height: ${maxH - 5}%; } 100% { height: ${minH + 15}%; } }
                @keyframes sp-bar-4 { 0% { height: ${minH + 10}%; } 100% { height: ${maxH - 15}%; } }
            `}</style>
        </div>
    )
}

addPropertyControls(SpotifyNowPlaying, {
    workerUrl: {
        type: ControlType.String,
        title: "Worker URL",
        defaultValue: "",
        placeholder: "https://your-worker.workers.dev",
    },
    pollInterval: {
        type: ControlType.Number,
        title: "Poll (sec)",
        defaultValue: 10,
        min: 5,
        max: 60,
        step: 1,
    },
    accentColor: {
        type: ControlType.Color,
        title: "Accent",
        defaultValue: "#1DB954",
    },
    backgroundColor: {
        type: ControlType.Color,
        title: "Background",
        defaultValue: "#18181B",
    },
    textColor: {
        type: ControlType.Color,
        title: "Text",
        defaultValue: "#FAFAFA",
    },
    mutedColor: {
        type: ControlType.Color,
        title: "Muted",
        defaultValue: "#52525B",
    },
    barCount: {
        type: ControlType.Number,
        title: "Bars",
        defaultValue: 24,
        min: 8,
        max: 60,
        step: 1,
    },
})
