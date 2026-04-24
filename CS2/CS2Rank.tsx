/**
 * @framerSupportedLayoutWidth any-prefer-fixed
 * @framerSupportedLayoutHeight auto
 * @framerIntrinsicWidth 320
 * @framerIntrinsicHeight 104
 */

import * as React from "react"
import { addPropertyControls, ControlType, RenderTarget } from "framer"
import { withPremierRating } from "./CS2Store"

type TierKey = "gray" | "lightBlue" | "blue" | "purple" | "pink" | "red" | "gold"

type TierSpec = {
    key: TierKey
    name: string
    min: number
    max: number
    text: string
    edge: string
    stripe: string
    glow: string
    start: string
    middle: string
    end: string
}

type CS2PremierRankProps = {
    text?: string
    previewValue: number
    usePreviewOnCanvas: boolean
    fallbackText: string
    showTierName: boolean
    showRange: boolean
    showStatus: boolean
    compactMeta: boolean
    fontSize: number
    borderRadius: number
    borderWidth: number
    slant: number
    glowStrength: number
    stripeWidth: number
    paddingX: number
    paddingY: number
    backgroundOpacity: number
    minHeight: number
}

const TIERS: TierSpec[] = [
    {
        key: "gray",
        name: "Gray",
        min: 0,
        max: 4_999,
        text: "#E8EDF8",
        edge: "#C9D2E4",
        stripe: "#F3F7FF",
        glow: "#C6D0E1",
        start: "#5E6678",
        middle: "#42495B",
        end: "#2D3342",
    },
    {
        key: "lightBlue",
        name: "Light Blue",
        min: 5_000,
        max: 9_999,
        text: "#8ED9FF",
        edge: "#79CBFF",
        stripe: "#AEE9FF",
        glow: "#2AABFF",
        start: "#265A84",
        middle: "#1D4B77",
        end: "#13314E",
    },
    {
        key: "blue",
        name: "Blue",
        min: 10_000,
        max: 14_999,
        text: "#6781FF",
        edge: "#6C80FF",
        stripe: "#8BA0FF",
        glow: "#355CFF",
        start: "#2A4CDA",
        middle: "#263DB9",
        end: "#1A2468",
    },
    {
        key: "purple",
        name: "Purple",
        min: 15_000,
        max: 19_999,
        text: "#C46BFF",
        edge: "#B95CFF",
        stripe: "#D892FF",
        glow: "#8D37F6",
        start: "#9A36D6",
        middle: "#7F28B7",
        end: "#53146E",
    },
    {
        key: "pink",
        name: "Pink",
        min: 20_000,
        max: 24_999,
        text: "#FF32E6",
        edge: "#FF27D8",
        stripe: "#FF7DEF",
        glow: "#EB00CE",
        start: "#BF00B2",
        middle: "#98008D",
        end: "#63015D",
    },
    {
        key: "red",
        name: "Red",
        min: 25_000,
        max: 29_999,
        text: "#FF4B4B",
        edge: "#FF4141",
        stripe: "#FF8F8F",
        glow: "#FF2323",
        start: "#B30E0E",
        middle: "#8A0909",
        end: "#5E0505",
    },
    {
        key: "gold",
        name: "Gold",
        min: 30_000,
        max: Number.POSITIVE_INFINITY,
        text: "#FFD93A",
        edge: "#FFD22D",
        stripe: "#FFF08E",
        glow: "#FFCE1F",
        start: "#B68F00",
        middle: "#8D6D00",
        end: "#5F4600",
    },
]

function parseRating(value?: string): number | null {
    if (!value) {
        return null
    }

    const normalized = value.replace(/[^\d.-]/g, "")
    if (!normalized) {
        return null
    }

    const parsed = Number(normalized)
    return Number.isFinite(parsed) ? parsed : null
}

function formatRating(value: number): string {
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
    }).format(Math.max(0, Math.round(value)))
}

function getTier(value: number): TierSpec {
    return TIERS.find((tier) => value >= tier.min && value <= tier.max) ?? TIERS[0]
}

function toRgba(hex: string, alpha: number): string {
    const sanitized = hex.replace("#", "")
    const expanded = sanitized.length === 3
        ? sanitized
              .split("")
              .map((char) => char + char)
              .join("")
        : sanitized

    const red = Number.parseInt(expanded.slice(0, 2), 16)
    const green = Number.parseInt(expanded.slice(2, 4), 16)
    const blue = Number.parseInt(expanded.slice(4, 6), 16)

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`
}

function getRangeLabel(tier: TierSpec): string {
    if (Number.isFinite(tier.max)) {
        return `${formatRating(tier.min)} - ${formatRating(tier.max)}`
    }

    return `${formatRating(tier.min)}+`
}

function resolveRatingText(props: CS2PremierRankProps): {
    rating: number | null
    displayText: string
    status: string
} {
    const liveRating = parseRating(props.text)
    const renderTarget = RenderTarget.current()
    const isCanvasLike =
        renderTarget === RenderTarget.canvas || renderTarget === RenderTarget.thumbnail

    if (liveRating !== null) {
        return {
            rating: liveRating,
            displayText: formatRating(liveRating),
            status: "LIVE",
        }
    }

    if (props.usePreviewOnCanvas && isCanvasLike) {
        return {
            rating: props.previewValue,
            displayText: formatRating(props.previewValue),
            status: "PREVIEW",
        }
    }

    return {
        rating: null,
        displayText: props.fallbackText,
        status: "WAITING",
    }
}

const PremierRankBase = React.forwardRef<HTMLDivElement, CS2PremierRankProps>(function PremierRankBase(
    props,
    ref
) {
    const { rating, displayText, status } = resolveRatingText(props)
    const tier = getTier(rating ?? 0)
    const compactGap = props.compactMeta ? 6 : 10
    const showMeta = props.showTierName || props.showRange || props.showStatus

    return (
        <div
            ref={ref}
            style={{
                width: "100%",
                display: "flex",
                flexDirection: "column",
                gap: compactGap,
                color: tier.text,
                fontFamily: '"Orbitron", "Rajdhani", "Space Grotesk", sans-serif',
            }}
        >
            <div
                style={{
                    position: "relative",
                    display: "flex",
                    alignItems: "stretch",
                    width: "100%",
                    minHeight: props.minHeight,
                    paddingLeft: props.stripeWidth * 2.8,
                    filter: `drop-shadow(0 0 ${12 + props.glowStrength * 18}px ${toRgba(
                        tier.glow,
                        0.2 + props.glowStrength * 0.22
                    )})`,
                }}
            >
                <div
                    style={{
                        position: "absolute",
                        left: 0,
                        top: 0,
                        bottom: 0,
                        display: "flex",
                        gap: Math.max(2, props.stripeWidth * 0.35),
                        alignItems: "stretch",
                    }}
                >
                    {[1, 0.78, 0.55].map((scale, index) => (
                        <div
                            key={index}
                            style={{
                                width: props.stripeWidth * scale,
                                borderRadius: Math.max(2, props.borderRadius * 0.25),
                                background:
                                    index === 0
                                        ? `linear-gradient(180deg, ${tier.stripe} 0%, ${tier.edge} 100%)`
                                        : `linear-gradient(180deg, ${toRgba(
                                              tier.stripe,
                                              0.95 - index * 0.22
                                          )} 0%, ${toRgba(tier.edge, 0.85 - index * 0.2)} 100%)`,
                                boxShadow:
                                    index === 0
                                        ? `0 0 12px ${toRgba(tier.glow, 0.45)}`
                                        : "none",
                                transform: "skewX(-10deg)",
                            }}
                        />
                    ))}
                </div>

                <div
                    style={{
                        position: "relative",
                        width: "100%",
                        minHeight: props.minHeight,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        overflow: "hidden",
                        borderRadius: props.borderRadius,
                        border: `${props.borderWidth}px solid ${toRgba(tier.edge, 0.95)}`,
                        clipPath: `polygon(${props.slant}% 0%, 100% 0%, ${100 - props.slant}% 100%, 0% 100%)`,
                        background: `linear-gradient(135deg, ${toRgba(
                            tier.start,
                            props.backgroundOpacity
                        )} 0%, ${toRgba(tier.middle, props.backgroundOpacity)} 52%, ${toRgba(
                            tier.end,
                            props.backgroundOpacity
                        )} 100%)`,
                        boxShadow: `inset 0 1px 0 ${toRgba(
                            tier.stripe,
                            0.32
                        )}, inset 0 -12px 24px ${toRgba("#000000", 0.22)}`,
                        padding: `${props.paddingY}px ${props.paddingX}px`,
                    }}
                >
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            background:
                                "linear-gradient(110deg, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0.09) 18%, rgba(255,255,255,0) 38%)",
                            mixBlendMode: "screen",
                            pointerEvents: "none",
                        }}
                    />
                    <div
                        style={{
                            position: "absolute",
                            inset: 0,
                            background:
                                "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0) 52%, rgba(0,0,0,0.22) 100%)",
                            pointerEvents: "none",
                        }}
                    />
                    <div
                        style={{
                            position: "relative",
                            zIndex: 1,
                            fontSize: props.fontSize,
                            fontWeight: 900,
                            fontStyle: "italic",
                            lineHeight: 1,
                            letterSpacing: "-0.06em",
                            color: tier.text,
                            textTransform: "uppercase",
                            textShadow: `0 0 ${8 + props.glowStrength * 10}px ${toRgba(
                                tier.glow,
                                0.42
                            )}`,
                            fontVariantNumeric: "tabular-nums",
                            whiteSpace: "nowrap",
                        }}
                    >
                        {displayText}
                    </div>
                </div>
            </div>

            {showMeta ? (
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 8,
                        fontFamily: "Inter, system-ui, sans-serif",
                        textTransform: "uppercase",
                        letterSpacing: "0.14em",
                        fontSize: props.compactMeta ? 9 : 10,
                        lineHeight: 1.2,
                        color: toRgba("#F4F7FD", 0.88),
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                        {props.showStatus ? (
                            <div
                                style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: 999,
                                    flexShrink: 0,
                                    backgroundColor:
                                        status === "LIVE" ? tier.text : toRgba("#FFFFFF", 0.35),
                                    boxShadow:
                                        status === "LIVE"
                                            ? `0 0 12px ${toRgba(tier.glow, 0.7)}`
                                            : "none",
                                }}
                            />
                        ) : null}
                        {props.showTierName ? (
                            <div
                                style={{
                                    color: tier.text,
                                    fontWeight: 700,
                                    overflow: "hidden",
                                    textOverflow: "ellipsis",
                                    whiteSpace: "nowrap",
                                }}
                            >
                                {tier.name}
                            </div>
                        ) : null}
                    </div>

                    {props.showRange ? (
                        <div
                            style={{
                                color: toRgba("#FFFFFF", 0.72),
                                fontWeight: 600,
                                whiteSpace: "nowrap",
                            }}
                        >
                            {getRangeLabel(tier)}
                        </div>
                    ) : null}
                </div>
            ) : null}
        </div>
    )
})

const LivePremierRank = withPremierRating(PremierRankBase)

export default function CS2PremierRank(props: CS2PremierRankProps) {
    return <LivePremierRank {...props} />
}

export function CS2PremierRankStatic(
    props: Omit<CS2PremierRankProps, "text"> & { value: number }
) {
    return <PremierRankBase {...props} text={String(props.value)} />
}

export const withLivePremierRating = withPremierRating

CS2PremierRank.defaultProps = {
    previewValue: 18_520,
    usePreviewOnCanvas: true,
    fallbackText: "—",
    showTierName: true,
    showRange: true,
    showStatus: true,
    compactMeta: false,
    fontSize: 28,
    borderRadius: 6,
    borderWidth: 1,
    slant: 11,
    glowStrength: 0.85,
    stripeWidth: 8,
    paddingX: 24,
    paddingY: 16,
    backgroundOpacity: 1,
    minHeight: 58,
}

addPropertyControls(CS2PremierRank, {
    previewValue: {
        type: ControlType.Number,
        title: "Preview",
        defaultValue: 18_520,
        min: 0,
        max: 40_000,
        step: 1,
        displayStepper: true,
    },
    usePreviewOnCanvas: {
        type: ControlType.Boolean,
        title: "Canvas Demo",
        defaultValue: true,
        enabledTitle: "On",
        disabledTitle: "Off",
    },
    fallbackText: {
        type: ControlType.String,
        title: "Fallback",
        defaultValue: "—",
    },
    showTierName: {
        type: ControlType.Boolean,
        title: "Tier",
        defaultValue: true,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    showRange: {
        type: ControlType.Boolean,
        title: "Range",
        defaultValue: true,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    showStatus: {
        type: ControlType.Boolean,
        title: "Status",
        defaultValue: true,
        enabledTitle: "Show",
        disabledTitle: "Hide",
    },
    compactMeta: {
        type: ControlType.Boolean,
        title: "Compact",
        defaultValue: false,
        enabledTitle: "Compact",
        disabledTitle: "Roomy",
    },
    fontSize: {
        type: ControlType.Number,
        title: "Size",
        defaultValue: 28,
        min: 16,
        max: 72,
        step: 1,
        displayStepper: true,
    },
    minHeight: {
        type: ControlType.Number,
        title: "Height",
        defaultValue: 58,
        min: 42,
        max: 120,
        step: 1,
        displayStepper: true,
    },
    paddingX: {
        type: ControlType.Number,
        title: "Pad X",
        defaultValue: 24,
        min: 8,
        max: 60,
        step: 1,
        displayStepper: true,
    },
    paddingY: {
        type: ControlType.Number,
        title: "Pad Y",
        defaultValue: 16,
        min: 6,
        max: 36,
        step: 1,
        displayStepper: true,
    },
    borderRadius: {
        type: ControlType.Number,
        title: "Radius",
        defaultValue: 6,
        min: 0,
        max: 24,
        step: 1,
        displayStepper: true,
    },
    borderWidth: {
        type: ControlType.Number,
        title: "Border",
        defaultValue: 1,
        min: 0,
        max: 4,
        step: 0.5,
        displayStepper: true,
    },
    slant: {
        type: ControlType.Number,
        title: "Slant",
        defaultValue: 11,
        min: 4,
        max: 18,
        step: 1,
        displayStepper: true,
    },
    stripeWidth: {
        type: ControlType.Number,
        title: "Stripes",
        defaultValue: 8,
        min: 4,
        max: 16,
        step: 1,
        displayStepper: true,
    },
    glowStrength: {
        type: ControlType.Number,
        title: "Glow",
        defaultValue: 0.85,
        min: 0,
        max: 1.5,
        step: 0.05,
        displayStepper: true,
    },
    backgroundOpacity: {
        type: ControlType.Number,
        title: "Opacity",
        defaultValue: 1,
        min: 0.35,
        max: 1,
        step: 0.05,
        displayStepper: true,
    },
})
