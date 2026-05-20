import { useState, useEffect } from "react"
import { addPropertyControls, ControlType } from "framer"

const STORAGE_KEY = "framer-theme-preference"
const STYLE_ID = "framer-theme-override"

/**
 * Theme toggle pill that switches Framer's variable-based colors.
 *
 * @framerSupportedLayoutWidth fixed
 * @framerSupportedLayoutHeight fixed
 * @framerIntrinsicWidth 56
 * @framerIntrinsicHeight 28
 */
export function ThemeToggle(props: any) {
    const width = typeof props.width === "number" ? props.width : 56
    const trackColorLight = props.trackColorLight || "#E5E7EB"
    const trackColorDark = props.trackColorDark || "#4F46E5"
    const thumbColor = props.thumbColor || "#FFFFFF"

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
                try {
                    rules = sheet.cssRules
                } catch (_) {
                    continue
                }
                if (!rules) continue
                for (let r = 0; r < rules.length; r++) {
                    const rule = rules[r]
                    if (rule.type === 1 && rule.selectorText === "body") {
                        for (let i = 0; i < rule.style.length; i++) {
                            const p = rule.style[i]
                            if (p.indexOf("--token-") === 0) {
                                lightTokens[p] = rule.style.getPropertyValue(p).trim()
                            }
                        }
                    } else if (
                        rule.type === 4 &&
                        rule.conditionText &&
                        rule.conditionText.indexOf("prefers-color-scheme") !== -1 &&
                        rule.conditionText.indexOf("dark") !== -1
                    ) {
                        const inner = rule.cssRules
                        for (let j = 0; j < inner.length; j++) {
                            const ir = inner[j]
                            if (ir.type === 1 && ir.selectorText === "body") {
                                for (let i = 0; i < ir.style.length; i++) {
                                    const p = ir.style[i]
                                    if (p.indexOf("--token-") === 0) {
                                        darkTokens[p] = ir.style.getPropertyValue(p).trim()
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (_) {}

        let style = document.getElementById(STYLE_ID)
        if (!style) {
            style = document.createElement("style")
            style.id = STYLE_ID
            document.head.appendChild(style)
        }

        const darkVars = Object.keys(darkTokens).map((k) => k + ":" + darkTokens[k]).join(";")
        const lightVars = Object.keys(lightTokens).map((k) => k + ":" + lightTokens[k]).join(";")
        style.textContent =
            'html[data-theme="dark"] body{' + darkVars + "}" +
            'html[data-theme="light"] body{' + lightVars + "}"

        let stored = null
        try {
            stored = localStorage.getItem(STORAGE_KEY)
        } catch (_) {}

        const dark = stored ? stored === "dark" : true
        document.documentElement.setAttribute("data-theme", dark ? "dark" : "light")
        setIsDark(dark)
    }, [])

    function toggle() {
        if (typeof document === "undefined") return
        const next = !isDark
        document.documentElement.setAttribute("data-theme", next ? "dark" : "light")
        try {
            localStorage.setItem(STORAGE_KEY, next ? "dark" : "light")
        } catch (_) {}
        setIsDark(next)
    }

    const height = width / 2
    const thumbSize = height - 8
    const thumbTravel = width - thumbSize - 8

    return (
        <div
            onClick={toggle}
            style={{
                width: width,
                height: height,
                minWidth: width,
                minHeight: height,
                borderRadius: height / 2,
                backgroundColor: isDark ? trackColorDark : trackColorLight,
                position: "relative",
                cursor: "pointer",
                transition: "background-color 0.3s ease",
                flexShrink: 0,
                display: "inline-block",
            }}
        >
            <div
                style={{
                    position: "absolute",
                    top: 4,
                    left: isDark ? thumbTravel : 4,
                    width: thumbSize,
                    height: thumbSize,
                    borderRadius: "50%",
                    backgroundColor: thumbColor,
                    transition: "left 0.3s ease",
                    boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
                }}
            />
        </div>
    )
}

ThemeToggle.defaultProps = {
    width: 56,
    trackColorLight: "#E5E7EB",
    trackColorDark: "#4F46E5",
    thumbColor: "#FFFFFF",
}

addPropertyControls(ThemeToggle, {
    width: {
        type: ControlType.Number,
        title: "Width",
        min: 40,
        max: 120,
        defaultValue: 56,
    },
    trackColorLight: {
        type: ControlType.Color,
        title: "Track (Light)",
        defaultValue: "#E5E7EB",
    },
    trackColorDark: {
        type: ControlType.Color,
        title: "Track (Dark)",
        defaultValue: "#4F46E5",
    },
    thumbColor: {
        type: ControlType.Color,
        title: "Thumb",
        defaultValue: "#FFFFFF",
    },
})

export default ThemeToggle
