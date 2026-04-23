import { startTransition, useSyncExternalStore } from "react"

const WORKER_URL = "https://your-worker-name.your-subdomain.workers.dev/cs2/profile" // CHANGE ME
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
    lastFetchedAt: number | null
}

type Listener = () => void
type OverrideProps = Record<string, unknown>
type OverrideResult = Record<string, unknown>

const listeners = new Set<Listener>()

let state: StoreState = {
    data: null,
    loading: false,
    error: null,
    lastFetchedAt: null,
}

let inFlightRequest: Promise<void> | null = null
let pollTimer: ReturnType<typeof globalThis.setInterval> | null = null

function getSnapshot(): StoreState {
    return state
}

function publish(nextState: StoreState) {
    state = nextState

    startTransition(() => {
        listeners.forEach((listener) => {
            listener()
        })
    })
}

function updateState(patch: Partial<StoreState>) {
    publish({
        ...state,
        ...patch,
    })
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null
}

function getStyle(props: OverrideProps): Record<string, unknown> {
    return isRecord(props.style) ? props.style : {}
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

function getDisplayText(data: CS2Data | null, selector: (data: CS2Data) => string): string {
    if (!data) {
        return FALLBACK_TEXT
    }

    return selector(data)
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

            const nextData: CS2Data = {
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
                        typeof payload.stats.reactionTime === "number" ? payload.stats.reactionTime : null,
                    accuracy: typeof payload.stats.accuracy === "number" ? payload.stats.accuracy : null,
                },
                lastUpdated:
                    typeof payload.lastUpdated === "string"
                        ? payload.lastUpdated
                        : new Date().toISOString(),
            }

            publish({
                data: nextData,
                loading: false,
                error: null,
                lastFetchedAt: Date.now(),
            })
        } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown CS2 fetch error."

            updateState({
                loading: false,
                error: message,
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

function subscribe(listener: Listener): () => void {
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

export function useCS2Data() {
    const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)

    return {
        data: snapshot.data,
        loading: snapshot.loading,
        error: snapshot.error,
    }
}

function buildTextOverride(
    props: OverrideProps,
    value: string
): OverrideResult {
    return {
        ...props,
        text: value,
        children: value,
    }
}

export function withPremierRating(props: OverrideProps): OverrideResult {
    const { data } = useCS2Data()
    const text = getDisplayText(data, (current) => formatNumber(current.premierRating))

    return buildTextOverride(props, text)
}

export function withProfileName(props: OverrideProps): OverrideResult {
    const { data } = useCS2Data()
    const text = getDisplayText(data, (current) => formatText(current.name))

    return buildTextOverride(props, text)
}

export function withProfileAvatar(props: OverrideProps): OverrideResult {
    const { data } = useCS2Data()
    const avatarUrl = data?.avatarUrl ?? null
    const style = getStyle(props)

    if (!avatarUrl) {
        return props
    }

    return {
        ...props,
        image: avatarUrl,
        src: avatarUrl,
        style: {
            ...style,
            backgroundImage: `url("${avatarUrl}")`,
            backgroundPosition: "center",
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
        },
    }
}

export function withProfileLink(props: OverrideProps): OverrideResult {
    const { data } = useCS2Data()
    const profileUrl = data?.profileUrl ?? null

    if (!profileUrl) {
        return props
    }

    return {
        ...props,
        href: profileUrl,
        link: profileUrl,
    }
}

export function withOnlineStatus(props: OverrideProps): OverrideResult {
    const { data } = useCS2Data()
    const online = data?.online ?? null
    const style = getStyle(props)
    const variant = online === true ? "Online" : online === false ? "Offline" : "Unknown"
    const backgroundColor = online === true ? "#3BB273" : online === false ? "#B3BAC5" : "#D7DCE2"

    return {
        ...props,
        variant,
        "data-online": online === true,
        style: {
            ...style,
            backgroundColor,
        },
    }
}

export function withPreaim(props: OverrideProps): OverrideResult {
    const { data } = useCS2Data()
    const text = getDisplayText(data, (current) => formatNumber(current.stats.preaim, 1))

    return buildTextOverride(props, text)
}

export function withReactionTime(props: OverrideProps): OverrideResult {
    const { data } = useCS2Data()
    const text = getDisplayText(data, (current) => formatNumber(current.stats.reactionTime))

    return buildTextOverride(props, text)
}

export function withAccuracy(props: OverrideProps): OverrideResult {
    const { data } = useCS2Data()
    const text = getDisplayText(data, (current) => formatNumber(current.stats.accuracy, 1))

    return buildTextOverride(props, text)
}
