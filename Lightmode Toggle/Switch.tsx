import { useState, useEffect } from "react"
import { addPropertyControls, ControlType } from "framer"

const STORAGE_KEY = "framer-theme-preference"
const STYLE_ID = "framer-theme-override"

/**
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 * @framerIntrinsicWidth 80
 * @framerIntrinsicHeight 44
 */
export function ThemeToggle(props: any) {
    const {
        style,
        width = 80,
        height = 44,
        trackPadding = 4,
        trackColorLight = "#E5E7EB",
        trackColorDark = "#1A1A1A",
        thumbColorLight = "#FFFFFF",
        thumbColorDark = "#3A3A3A",
        trackRadius = 999,
        thumbRadius = 999,
        iconLight = null,
        iconDark = null,
        iconSize = 60,
        transitionDuration = 0.3,
    } = props

    const [isDark, setIsDark] = useState(true)

    useEffect(() => {
        if (typeof window === "undefined" || typeof document === "undefined") return

        const darkTokens: Record<string, string> = {}
        const lightTokens: Record<string, string> = {}

        try {
            const sheets = document.styleSheets
            for (let s = 0; s < sheets.length; s++) {
                const sheet = sheets[s]
                let rules = null
                try { rules = sheet.cssRules } catch (_) { continue }
                if (!rules) continue
                for (let r = 0; r < rules.length; r++) {
                    const rule = rules[r]
                    if (rule.type === 1 && rule.selectorText === "body") {
                        for (let i = 0; i < rule.style.length; i++) {
                            const p = rule.style[i]
                            if (p.indexOf("--token-") === 0)
                                lightTokens[p] = rule.style.getPropertyValue(p).trim()
                        }
                    } else if (
                        rule.type === 4 &&
                        rule.conditionText?.indexOf("prefers-color-scheme") !== -1 &&
                        rule.conditionText?.indexOf("dark") !== -1
                    ) {
                        const inner = rule.cssRules
                        for (let j = 0; j < inner.length; j++) {
                            const ir = inner[j]
                            if (ir.type === 1 && ir.selectorText === "body") {
                                for (let i = 0; i < ir.style.length; i++) {
                                    const p = ir.style[i]
                                    if (p.indexOf("--token-") === 0)
                                        darkTokens[p] = ir.style.getPropertyValue(p).trim()
                                }
                            }
                        }
                    }
                }
            }
        } catch (_) {}

        let el = document.getElementById(STYLE_ID)
        if (!el) {
            el = document.createElement("style")
            el.id = STYLE_ID
            document.head.appendChild(el)
        }

        const darkVars = Object.keys(darkTokens).map((k) => k + ":" + darkTokens[k]).join(";")
        const lightVars = Object.keys(lightTokens).map((k) => k + ":" + lightTokens[k]).join(";")
        el.textContent =
            'html[data-theme="dark"] body{' + darkVars + "}" +
            'html[data-theme="light"] body{' + lightVars + "}"

        let stored = null
        try { stored = localStorage.getItem(STORAGE_KEY) } catch (_) {}

        const dark = stored ? stored === "dark" : true
        document.documentElement.setAttribute("data-theme", dark ? "dark" : "light")
        setIsDark(dark)
    }, [])

    function toggle() {
        if (typeof document === "undefined") return
        const next = !isDark
        document.documentElement.setAttribute("data-theme", next ? "dark" : "light")
        try { localStorage.setItem(STORAGE_KEY, next ? "dark" : "light") } catch (_) {}
        setIsDark(next)
    }

    // Framer passes canvas dimensions via style.width / style.height when layout is fixed.
    // Fall back to the numeric props (which default to intrinsic size) if style isn't present.
    const w = (style?.width as number) ?? width
    const h = (style?.height as number) ?? height

    const thumbSize = h - trackPadding * 2
    const thumbLeft = isDark ? w - thumbSize - trackPadding : trackPadding
    const icon = isDark ? iconDark : iconLight

    return (
        <div
            onClick={toggle}
            style={{
                ...style,
                width: w,
                height: h,
                borderRadius: trackRadius,
                backgroundColor: isDark ? trackColorDark : trackColorLight,
                position: "relative",
                cursor: "pointer",
                overflow: "hidden",
                transition: `background-color ${transitionDuration}s ease`,
            }}
        >
            <div
                style={{
                    position: "absolute",
                    top: trackPadding,
                    left: thumbLeft,
                    width: thumbSize,
                    height: thumbSize,
                    borderRadius: thumbRadius,
                    backgroundColor: isDark ? thumbColorDark : thumbColorLight,
                    transition: `left ${transitionDuration}s ease`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                }}
            >
                {icon && (
                    <img
                        src={icon}
                        style={{
                            width: `${iconSize}%`,
                            height: `${iconSize}%`,
                            objectFit: "contain",
                            pointerEvents: "none",
                            userSelect: "none",
                        }}
                    />
                )}
            </div>
        </div>
    )
}

ThemeToggle.defaultProps = {
    trackPadding: 4,
    trackColorLight: "#E5E7EB",
    trackColorDark: "#1A1A1A",
    thumbColorLight: "#FFFFFF",
    thumbColorDark: "#3A3A3A",
    trackRadius: 999,
    thumbRadius: 999,
    iconSize: 60,
    transitionDuration: 0.3,
}

addPropertyControls(ThemeToggle, {
    trackPadding: {
        type: ControlType.Number,
        title: "Track Padding",
        min: 0,
        max: 20,
        defaultValue: 4,
    },
    trackRadius: {
        type: ControlType.Number,
        title: "Track Radius",
        min: 0,
        max: 999,
        defaultValue: 999,
    },
    thumbRadius: {
        type: ControlType.Number,
        title: "Thumb Radius",
        min: 0,
        max: 999,
        defaultValue: 999,
    },
    trackColorLight: {
        type: ControlType.Color,
        title: "Track — Light",
        defaultValue: "#E5E7EB",
    },
    trackColorDark: {
        type: ControlType.Color,
        title: "Track — Dark",
        defaultValue: "#1A1A1A",
    },
    thumbColorLight: {
        type: ControlType.Color,
        title: "Thumb — Light",
        defaultValue: "#FFFFFF",
    },
    thumbColorDark: {
        type: ControlType.Color,
        title: "Thumb — Dark",
        defaultValue: "#3A3A3A",
    },
    iconLight: {
        type: ControlType.Image,
        title: "Icon — Light",
    },
    iconDark: {
        type: ControlType.Image,
        title: "Icon — Dark",
    },
    iconSize: {
        type: ControlType.Number,
        title: "Icon Size %",
        min: 10,
        max: 100,
        defaultValue: 60,
        unit: "%",
    },
    transitionDuration: {
        type: ControlType.Number,
        title: "Transition",
        min: 0,
        max: 1,
        step: 0.05,
        defaultValue: 0.3,
        unit: "s",
    },
})

export default ThemeToggle
