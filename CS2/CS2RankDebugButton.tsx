/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight any-prefer-fixed
 * @framerIntrinsicWidth 140
 * @framerIntrinsicHeight 44
 */

import * as React from "react"
import { addPropertyControls, ControlType } from "framer"

const LOCAL_DEBUG_DELTA_STORAGE_KEY = "cs2-rank-local-debug-delta"
const LOCAL_DEBUG_DELTA_EVENT = "cs2-rank-local-debug-delta-change"

type ActionType = "increment" | "decrement" | "reset"

type Props = {
    label: string
    action: ActionType
    amount: number
    tint: string
    textColor: string
    radius: number
    fontSize: number
}

function writeDelta(delta: number) {
    if (typeof window === "undefined") {
        return
    }

    window.localStorage.setItem(LOCAL_DEBUG_DELTA_STORAGE_KEY, String(delta))
    window.dispatchEvent(
        new CustomEvent(LOCAL_DEBUG_DELTA_EVENT, {
            detail: { delta },
        })
    )
}

function clearDelta() {
    if (typeof window === "undefined") {
        return
    }

    window.localStorage.removeItem(LOCAL_DEBUG_DELTA_STORAGE_KEY)
    window.dispatchEvent(
        new CustomEvent(LOCAL_DEBUG_DELTA_EVENT, {
            detail: { active: false },
        })
    )
}

function readDelta() {
    if (typeof window === "undefined") {
        return 0
    }

    const raw = window.localStorage.getItem(LOCAL_DEBUG_DELTA_STORAGE_KEY)
    const parsed = Number(raw)
    return Number.isFinite(parsed) ? parsed : 0
}

function randomStep() {
    return Math.random() < 0.5 ? -999 : 999
}

export default function CS2RankDebugButton(props: Props) {
    const { label, action, tint, textColor, radius, fontSize } = props

    const handleClick = React.useCallback(() => {
        if (action === "reset") {
            clearDelta()
            return
        }

        writeDelta(readDelta() + randomStep())
    }, [action])

    return (
        <button
            type="button"
            onClick={handleClick}
            style={{
                width: "100%",
                height: "100%",
                border: "none",
                borderRadius: radius,
                background: tint,
                color: textColor,
                fontSize,
                fontWeight: 700,
                cursor: "pointer",
                fontFamily: "Inter, system-ui, sans-serif",
                letterSpacing: "0.01em",
            }}
        >
            {label}
        </button>
    )
}

CS2RankDebugButton.defaultProps = {
    label: "Random Delta",
    action: "increment",
    amount: 1,
    tint: "#6D28D9",
    textColor: "#FFFFFF",
    radius: 10,
    fontSize: 14,
}

addPropertyControls(CS2RankDebugButton, {
    label: {
        type: ControlType.String,
        title: "Label",
        defaultValue: "Random Delta",
    },
    action: {
        type: ControlType.Enum,
        title: "Action",
        defaultValue: "increment",
        options: ["increment", "decrement", "reset"],
        optionTitles: ["Randomize", "Randomize", "Reset"],
    },
    amount: {
        type: ControlType.Number,
        title: "Amount",
        defaultValue: 1,
        min: 1,
        max: 500,
        step: 1,
        displayStepper: true,
        hidden: () => true,
    },
    tint: {
        type: ControlType.Color,
        title: "Tint",
        defaultValue: "#6D28D9",
    },
    textColor: {
        type: ControlType.Color,
        title: "Text",
        defaultValue: "#FFFFFF",
    },
    radius: {
        type: ControlType.Number,
        title: "Radius",
        defaultValue: 10,
        min: 0,
        max: 30,
        step: 1,
        displayStepper: true,
    },
    fontSize: {
        type: ControlType.Number,
        title: "Size",
        defaultValue: 14,
        min: 10,
        max: 32,
        step: 1,
        displayStepper: true,
    },
})
