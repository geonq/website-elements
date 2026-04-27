import { forwardRef, type ComponentType, useSyncExternalStore } from "react"

const WORKER_URL = "https://cs2store.domkegeorg2017.workers.dev/cs2/profile" // CHANGE ME
const POLL_INTERVAL_MS = 60_000
const FALLBACK_TEXT = "—"

type CS2Data = {
    name: string | null
    profileUrl: string | null
    avatarUrl: string | null
    online: boolean | null
    premierRating: number | null
    wingmanRating: number | null
    faceitElo: number | null
    stats: {
        preaim: number | null
        reactionTime: number | null
        accuracy: number | null
    }
    lastUpdated: string
}

type StoreState = {
    data: CS2Data | null
    loading: boolean
    error: string | null
}

const listeners = new Set<() => void>()

let state: StoreState = {
    data: null,
    loading: false,
    error: null,
}

let inFlightRequest: Promise<void> | null = null
let pollTimer: ReturnType<typeof globalThis.setInterval> | null = null

function publish(nextState: StoreState) {
    state = nextState
    listeners.forEach((listener) => listener())
}

function updateState(patch: Partial<StoreState>) {
    publish({
        ...state,
        ...patch,
    })
}

function getSnapshot() {
    return state
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

function getStyle(style: unknown): Record<string, unknown> {
    return isRecord(style) ? style : {}
}

function formatText(value: string | number | null | undefined): string {
    if (value === null || value === undefined || value === "") {
        return FALLBACK_TEXT
    }

    return String(value)
}

function formatNumber(value: number | null | undefined, digits = 0): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return FALLBACK_TEXT
    }

    return digits === 0 ? String(Math.round(value)) : value.toFixed(digits)
}

function formatInt(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return FALLBACK_TEXT
    }

    return new Intl.NumberFormat("en-US").format(Math.round(value))
}

function formatPercent(value: number | null | undefined, digits = 1): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return FALLBACK_TEXT
    }

    return `${value.toFixed(digits)}%`
}

function formatMs(value: number | null | undefined): string {
    if (value === null || value === undefined || Number.isNaN(value)) {
        return FALLBACK_TEXT
    }

    return `${Math.round(value)} ms`
}

async function fetchCS2Data(): Promise<void> {
    if (inFlightRequest) {
        return inFlightRequest
    }

    inFlightRequest = (async () => {
        updateState({
            loading: state.data === null,
            error: null,
        })

        try {
            const response = await fetch(WORKER_URL, {
                method: "GET",
                headers: {
                    Accept: "application/json",
                },
            })

            let payload: unknown = null

            try {
                payload = await response.json()
            } catch {
                payload = null
            }

            if (!response.ok) {
                const message =
                    isRecord(payload) && typeof payload.error === "string"
                        ? payload.error
                        : `Request failed with status ${response.status}`

                throw new Error(message)
            }

            if (!isRecord(payload) || !isRecord(payload.stats)) {
                throw new Error("Worker response shape was invalid.")
            }

            publish({
                data: {
                    name: typeof payload.name === "string" ? payload.name : null,
                    profileUrl: typeof payload.profileUrl === "string" ? payload.profileUrl : null,
                    avatarUrl: typeof payload.avatarUrl === "string" ? payload.avatarUrl : null,
                    online: typeof payload.online === "boolean" ? payload.online : null,
                    premierRating: typeof payload.premierRating === "number" ? payload.premierRating : null,
                    wingmanRating: typeof payload.wingmanRating === "number" ? payload.wingmanRating : null,
                    faceitElo: typeof payload.faceitElo === "number" ? payload.faceitElo : null,
                    stats: {
                        preaim: typeof payload.stats.preaim === "number" ? payload.stats.preaim : null,
                        reactionTime:
                            typeof payload.stats.reactionTime === "number"
                                ? payload.stats.reactionTime
                                : null,
                        accuracy:
                            typeof payload.stats.accuracy === "number" ? payload.stats.accuracy : null,
                    },
                    lastUpdated:
                        typeof payload.lastUpdated === "string"
                            ? payload.lastUpdated
                            : new Date().toISOString(),
                },
                loading: false,
                error: null,
            })
        } catch (error) {
            updateState({
                loading: false,
                error: error instanceof Error ? error.message : "Unknown CS2 fetch error.",
            })
        } finally {
            inFlightRequest = null
        }
    })()

    return inFlightRequest
}

function stopPolling() {
    if (pollTimer !== null) {
        globalThis.clearInterval(pollTimer)
        pollTimer = null
    }
}

function startPolling() {
    if (pollTimer !== null) {
        return
    }

    void fetchCS2Data()

    pollTimer = globalThis.setInterval(() => {
        void fetchCS2Data()
    }, POLL_INTERVAL_MS)
}

function subscribe(listener: () => void) {
    listeners.add(listener)

    if (listeners.size === 1) {
        startPolling()
    }

    return () => {
        listeners.delete(listener)

        if (listeners.size === 0) {
            stopPolling()
        }
    }
}

function useCS2Store() {
    return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

export function useCS2Data() {
    return useCS2Store()
}

export const withPremierRating = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const text = formatInt(data?.premierRating ?? null)

        return <Component ref={ref} {...props} text={text} />
    })
}

export const withWingmanRating = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const text = formatInt(data?.wingmanRating ?? null)

        return <Component ref={ref} {...props} text={text} />
    })
}

export const withFaceitElo = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const text = formatInt(data?.faceitElo ?? null)

        return <Component ref={ref} {...props} text={text} />
    })
}

export const withProfileName = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const text = formatText(data?.name ?? null)

        return <Component ref={ref} {...props} text={text} />
    })
}

export const withProfileAvatar = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const avatarUrl = data?.avatarUrl ?? null

        if (!avatarUrl) {
            return <Component ref={ref} {...props} />
        }

        return (
            <Component
                ref={ref}
                {...props}
                image={avatarUrl}
                src={avatarUrl}
                style={{
                    ...getStyle(props?.style),
                    backgroundImage: `url("${avatarUrl}")`,
                    backgroundPosition: "center",
                    backgroundRepeat: "no-repeat",
                    backgroundSize: "cover",
                }}
            />
        )
    })
}

export const withOnlineStatus = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const online = data?.online ?? null
        const variant = online === true ? "Online" : online === false ? "Offline" : "Unknown"
        const backgroundColor = online === true ? "#3BB273" : online === false ? "#B3BAC5" : "#D7DCE2"

        return (
            <Component
                ref={ref}
                {...props}
                variant={variant}
                style={{
                    ...getStyle(props?.style),
                    backgroundColor,
                }}
            />
        )
    })
}

export const withPreaim = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const text = formatNumber(data?.stats.preaim ?? null, 1)

        return <Component ref={ref} {...props} text={text} />
    })
}

export const withReactionTime = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const text = formatNumber(data?.stats.reactionTime ?? null)

        return <Component ref={ref} {...props} text={text} />
    })
}

export const withReactionTimeMs = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const text = formatMs(data?.stats.reactionTime ?? null)

        return <Component ref={ref} {...props} text={text} />
    })
}

export const withAccuracy = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const text = formatNumber(data?.stats.accuracy ?? null, 1)

        return <Component ref={ref} {...props} text={text} />
    })
}

export const withAccuracyPercent = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const text = formatPercent(data?.stats.accuracy ?? null, 1)

        return <Component ref={ref} {...props} text={text} />
    })
}

export const withOnlineStatusText = (Component): ComponentType => {
    return forwardRef((props, ref) => {
        const { data } = useCS2Store()
        const text =
            data?.online === true
                ? "Online"
                : data?.online === false
                  ? "Offline"
                  : FALLBACK_TEXT

        return <Component ref={ref} {...props} text={text} />
    })
}
