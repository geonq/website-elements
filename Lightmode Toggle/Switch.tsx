import { useState, useEffect } from "react"
import { addPropertyControls, ControlType } from "framer"

const STORAGE_KEY = "framer-theme-preference"
const STYLE_ID = "framer-theme-override"

export default function ThemeToggle({
    width = 56,
    trackColorLight = "#E5E7EB",
    trackColorDark = "#4F46E5",
    thumbColor = "#FFFFFF",
}: {
    width?: number
    trackColorLight?: string
    trackColorDark?: string
    thumbColor?: string
}) {
    const [isDark, setIsDark] = useState(true)

    useEffect(() => {
        if (typeof window === "undefined" || typeof document === "undefined") return

        const darkTokens: Record<string, string> = {}
        const lightTokens: Record<string, string> = {}

        try {
            for (const sheet of Array.from(document.styleSheets)) {
                let rules: CSSRuleList | null = null
                try {
                    rules = sheet.cssRules
                } catch (_) {
                    continue
                }
                if (!rules) continue
                for (const rule of Array.from(rules)) {
                    if (rule instanceof CSSStyleRule && rule.selectorText === "body") {
                        for (let i = 0; i < rule.style.length; i++) {
                            const p = rule.style[i]
                            if (p.startsWith("--token-")) {
                                lightTokens[p] = rule.style.getPropertyValue(p).trim()
                            }
                        }
                    } else if (
                        rule instanceof CSSMediaRule &&
                        rule.conditionText &&
                        rule.conditionText.indexOf("prefers-color-scheme") !== -1 &&
                        rule.conditionText.indexOf("dark") !== -1
                    ) {
                        for (const inner of Array.from(rule.cssRules)) {
                            if (inner instanceof CSSStyleRule && inner.selectorText === "body") {
                                for (let i = 0; i < inner.style.length; i++) {
                                    const p = inner.style[i]
                                    if (p.startsWith("--token-")) {
                                        darkTokens[p] = inner.style.getPropertyValue(p).trim()
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (_) {}

        let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
        if (!style) {
            style = document.createElement("style")
            style.id = STYLE_ID
            document.head.appendChild(style)
        }

        const darkVars = Object.entries(darkTokens)
            .map(([k, v]) => `${k}:${v}`)
            .join(";")
        const lightVars = Object.entries(lightTokens)
            .map(([k, v]) => `${k}:${v}`)
            .join(";")

        style.textContent = `html[data-theme="dark"] body{${darkVars}} html[data-theme="light"] body{${lightVars}}`

        let stored: string | null = null
        try {
            stored = localStorage.getItem(STORAGE_KEY)
        } catch (_) {}

        const dark = stored ? stored === "dark" : true
        document.documentElement.setAttribute("data-theme", dark ? "dark" : "light")
        setIsDark(dark)
    }, [])

    function toggle() {
        if (typeof window === "undefined" || typeof document === "undefined") return
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
                width,
                height,
                borderRadius: height / 2,
                backgroundColor: isDark ? trackColorDark : trackColorLight,
                position: "relative",
                cursor: "pointer",
                transition: "background-color 0.3s ease",
                flexShrink: 0,
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
