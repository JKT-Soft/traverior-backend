import {
  Button,
  Card,
  CardBody,
  CardHeader,
  CollapsibleSection,
  Divider,
  Grid,
  H1,
  H2,
  H3,
  Pill,
  Row,
  Stack,
  Stat,
  Text,
  TextInput,
  Toggle,
  useCanvasState,
  useHostTheme,
  type CSSProperties,
} from "cursor/canvas";

type Screen =
  | "overview"
  | "home"
  | "planning"
  | "pipeline"
  | "checkpoint"
  | "today"
  | "profile";

const SCREENS: { id: Screen; label: string }[] = [
  { id: "overview", label: "Design System" },
  { id: "home", label: "Home" },
  { id: "planning", label: "AI Planning" },
  { id: "pipeline", label: "Journey Pipeline" },
  { id: "checkpoint", label: "Checkpoint Detail" },
  { id: "today", label: "Today Mode" },
  { id: "profile", label: "Preferences" },
];

const TRIP = {
  title: "Asia Timur 2026",
  dates: "1–12 Okt 2026",
  days: 12,
  budget: "IDR 28.450.000",
  progress: 35,
  checkpoints: [
    { id: "jkt", city: "Jakarta", role: "Origin", nights: 0, status: "done" as const },
    { id: "sha", city: "Shanghai", role: "Transit", nights: 0, status: "done" as const },
    { id: "osa", city: "Osaka", role: "Stay", nights: 3, status: "active" as const },
    { id: "kyo", city: "Kyoto", role: "Stay", nights: 2, status: "upcoming" as const },
    { id: "tyo", city: "Tokyo", role: "Stay", nights: 3, status: "upcoming" as const },
    { id: "tpe", city: "Taipei", role: "Transit", nights: 0, status: "upcoming" as const },
    { id: "jkt2", city: "Jakarta", role: "Return", nights: 0, status: "upcoming" as const },
  ],
};

const OSAKA_SEGMENTS = [
  { time: "14:00", title: "KIX Airport → Hotel", meta: "Nankai Rapi:t · 45 min · ¥920", type: "transport" },
  { time: "15:00", title: "Check-in Hotel", meta: "Hotel Granvia Osaka · 3 malam", type: "hotel" },
  { time: "18:00", title: "Dotonbori", meta: "Makan malam · Halal-friendly · ~¥2.000", type: "food" },
  { time: "09:00", title: "Osaka Castle", meta: "Train · 30 min · ¥600", type: "activity" },
  { time: "19:00", title: "Food Tour", meta: "Event · 3 jam · ¥8.500", type: "event" },
];

function PhoneFrame({
  children,
  title,
  subtitle,
}: {
  children: unknown;
  title: string;
  subtitle?: string;
}) {
  const theme = useHostTheme();
  return (
    <div
      style={{
        width: 360,
        minHeight: 640,
        borderRadius: 24,
        border: `1px solid ${theme.stroke.secondary}`,
        background: theme.bg.editor,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div
        style={{
          padding: "12px 16px 8px",
          borderBottom: `1px solid ${theme.stroke.tertiary}`,
          background: theme.bg.chrome,
        }}
      >
        <Row align="center" justify="space-between">
          <Stack gap={2}>
            <Text weight="medium">{title}</Text>
            {subtitle ? (
              <Text size="small" tone="secondary">
                {subtitle}
              </Text>
            ) : null}
          </Stack>
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: 9999,
              background: theme.accent.primary,
            }}
          />
        </Row>
      </div>
      <div style={{ flex: 1, overflow: "auto", padding: 16 }}>{children}</div>
      <BottomNav />
    </div>
  );
}

function BottomNav() {
  const theme = useHostTheme();
  const items = ["Home", "Journey", "Today", "Profile"];
  return (
    <div
      style={{
        display: "flex",
        borderTop: `1px solid ${theme.stroke.tertiary}`,
        background: theme.bg.chrome,
        padding: "8px 4px 12px",
      }}
    >
      {items.map((item, i) => (
        <div
          key={item}
          style={{
            flex: 1,
            textAlign: "center",
            padding: "6px 0",
          }}
        >
          <div
            style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              margin: "0 auto 4px",
              background: i === 1 ? theme.accent.primary : theme.fill.tertiary,
              opacity: i === 1 ? 1 : 0.5,
            }}
          />
          <Text size="small" tone={i === 1 ? "primary" : "tertiary"}>
            {item}
          </Text>
        </div>
      ))}
    </div>
  );
}

function BudgetBar({ amount, label }: { amount: string; label?: string }) {
  const theme = useHostTheme();
  return (
    <div
      style={{
        padding: "10px 14px",
        borderRadius: 10,
        background: theme.fill.tertiary,
        border: `1px solid ${theme.stroke.tertiary}`,
      }}
    >
      <Row align="center" justify="space-between">
        <Text size="small" tone="secondary">
          {label ?? "Total trip"}
        </Text>
        <Text weight="medium">{amount}</Text>
      </Row>
    </div>
  );
}

function PipelineSpine({ compact }: { compact?: boolean }) {
  const theme = useHostTheme();
  return (
    <Stack gap={0}>
      {TRIP.checkpoints.map((cp, idx) => {
        const isLast = idx === TRIP.checkpoints.length - 1;
        const dotColor =
          cp.status === "done"
            ? theme.text.tertiary
            : cp.status === "active"
              ? theme.accent.primary
              : theme.fill.secondary;
        return (
          <div key={cp.id} style={{ display: "flex", gap: 12 }}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 20 }}>
              <div
                style={{
                  width: cp.status === "active" ? 14 : 10,
                  height: cp.status === "active" ? 14 : 10,
                  borderRadius: 9999,
                  background: dotColor,
                  border: cp.status === "active" ? `2px solid ${theme.accent.control}` : "none",
                  flexShrink: 0,
                }}
              />
              {!isLast ? (
                <div
                  style={{
                    width: 2,
                    flex: 1,
                    minHeight: compact ? 28 : 44,
                    background: theme.stroke.tertiary,
                    margin: "4px 0",
                  }}
                />
              ) : null}
            </div>
            <div style={{ flex: 1, paddingBottom: compact ? 8 : 16 }}>
              <Row align="center" gap={8}>
                <Text weight={cp.status === "active" ? "medium" : "normal"}>{cp.city}</Text>
                <Pill size="sm" active={cp.status === "active"}>
                  {cp.role}
                </Pill>
              </Row>
              {!compact && cp.nights > 0 ? (
                <Text size="small" tone="tertiary">
                  {cp.nights} malam
                </Text>
              ) : null}
              {cp.status === "active" ? (
                <Text size="small" tone="secondary">
                  Tap to open sub-pipeline
                </Text>
              ) : null}
            </div>
          </div>
        );
      })}
    </Stack>
  );
}

function SegmentRow({
  time,
  title,
  meta,
  active,
}: {
  time: string;
  title: string;
  meta: string;
  active?: boolean;
}) {
  const theme = useHostTheme();
  return (
    <div
      style={{
        padding: "12px 14px",
        borderRadius: 10,
        background: active ? theme.fill.secondary : theme.bg.elevated,
        border: `1px solid ${active ? theme.accent.primary : theme.stroke.tertiary}`,
      }}
    >
      <Row align="start" gap={12}>
        <Text size="small" tone="secondary" style={{ minWidth: 40 }}>
          {time}
        </Text>
        <Stack gap={4} style={{ flex: 1 }}>
          <Text weight="medium">{title}</Text>
          <Text size="small" tone="tertiary">
            {meta}
          </Text>
        </Stack>
      </Row>
    </div>
  );
}

function ScreenNav({
  active,
  onChange,
}: {
  active: Screen;
  onChange: (s: Screen) => void;
}) {
  return (
    <Row gap={6} wrap>
      {SCREENS.map((s) => (
        <span key={s.id}>
          <Button
            variant={active === s.id ? "primary" : "secondary"}
            onClick={() => onChange(s.id)}
          >
            {s.label}
          </Button>
        </span>
      ))}
    </Row>
  );
}

function HomeScreen() {
  const theme = useHostTheme();
  return (
    <PhoneFrame title="Traverior" subtitle="Your journey, in flow.">
      <Stack gap={16}>
        <div
          style={{
            padding: 20,
            borderRadius: 14,
            background: theme.fill.tertiary,
            border: `1px solid ${theme.stroke.tertiary}`,
          }}
        >
        <Stack gap={10}>
          <Text weight="medium">Mau kemana?</Text>
          <TextInput placeholder="Ceritakan trip impianmu..." />
          <Button variant="primary">Rencanakan dengan AI</Button>
        </Stack>
        </div>

        <Stack gap={8}>
          <Text size="small" tone="secondary">
            Trip aktif
          </Text>
          <Card>
            <CardBody>
              <Stack gap={8}>
                <Row align="center" justify="space-between">
                  <Text weight="medium">{TRIP.title}</Text>
                  <Pill active size="sm">
                    Day 4
                  </Pill>
                </Row>
                <Text size="small" tone="tertiary">
                  {TRIP.dates} · Osaka sekarang
                </Text>
                <BudgetBar amount={TRIP.budget} />
                <Button variant="secondary">Lanjutkan journey</Button>
              </Stack>
            </CardBody>
          </Card>
        </Stack>

        <Stack gap={8}>
          <Text size="small" tone="secondary">
            Quick start
          </Text>
          <Row gap={8} wrap>
            {["Weekend getaway", "Bulan madu", "Solo adventure"].map((chip) => (
              <span key={chip}>
                <Pill size="sm">{chip}</Pill>
              </span>
            ))}
          </Row>
        </Stack>
      </Stack>
    </PhoneFrame>
  );
}

function PlanningScreen() {
  const theme = useHostTheme();
  return (
    <PhoneFrame title="AI Planning" subtitle="Membangun pipeline perjalanan">
      <Stack gap={14}>
        <div
          style={{
            padding: 14,
            borderRadius: 12,
            background: theme.fill.tertiary,
            border: `1px solid ${theme.stroke.tertiary}`,
          }}
        >
        <Stack gap={4}>
          <Text size="small" tone="secondary">
            Kamu
          </Text>
          <Text>
            Dari Jakarta ke Jepang + Taiwan, 10 hari, suka budaya & makanan, budget menengah
          </Text>
        </Stack>
        </div>

        <Stack gap={10}>
          <Row align="center" gap={8}>
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: 9999,
                background: theme.accent.primary,
              }}
            />
            <Text size="small" tone="secondary">
              AI sedang merencanakan...
            </Text>
          </Row>

          {[
            { step: "Struktur journey", done: true },
            { step: "Cari penerbangan CGK → PVG → KIX", done: true },
            { step: "Cari hotel Osaka, Kyoto, Tokyo", done: true },
            { step: "Hitung rute & waktu antar destinasi", done: false },
            { step: "Susun checklist & rekomendasi", done: false },
          ].map((item) => (
            <div key={item.step}>
              <Row align="center" gap={10}>
                <div
                  style={{
                    width: 16,
                    height: 16,
                    borderRadius: 4,
                    background: item.done ? theme.accent.primary : theme.fill.quaternary,
                    opacity: item.done ? 1 : 0.4,
                  }}
                />
                <Text size="small" tone={item.done ? "primary" : "tertiary"}>
                  {item.step}
                </Text>
              </Row>
            </div>
          ))}
        </Stack>

        <Divider />

        <Text size="small" tone="secondary">
          Preview pipeline
        </Text>
        <PipelineSpine compact />

        <Button variant="primary">Review & Customize</Button>
      </Stack>
    </PhoneFrame>
  );
}

function PipelineScreen() {
  const theme = useHostTheme();
  return (
    <PhoneFrame title={TRIP.title} subtitle={`${TRIP.dates} · ${TRIP.budget}`}>
      <Stack gap={14}>
        <Row gap={8}>
          <Pill active size="sm">
            Pipeline
          </Pill>
          <Pill size="sm">Map</Pill>
          <Pill size="sm">Budget</Pill>
        </Row>

        <div
          style={{
            padding: "6px 0",
            borderRadius: 8,
            background: theme.fill.quaternary,
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: 4,
              width: `${TRIP.progress}%`,
              background: theme.accent.primary,
              borderRadius: 4,
            }}
          />
        </div>
        <Text size="small" tone="tertiary">
          Progress {TRIP.progress}% · Day 4 of 12
        </Text>

        <PipelineSpine />

        <Card>
          <CardHeader>Side modules</CardHeader>
          <CardBody>
            <Row gap={8} wrap>
              <Pill size="sm">Checklist (12)</Pill>
              <Pill size="sm">Recommendations (8)</Pill>
              <Pill size="sm">Alerts (1)</Pill>
            </Row>
          </CardBody>
        </Card>
      </Stack>
    </PhoneFrame>
  );
}

function CheckpointScreen() {
  return (
    <PhoneFrame title="Osaka" subtitle="Stay · 3 malam · Sub-pipeline">
      <Stack gap={14}>
        <Row gap={6} wrap>
          <Text size="small" tone="tertiary">
            Asia Timur 2026
          </Text>
          <Text size="small" tone="tertiary">
            /
          </Text>
          <Text size="small" tone="secondary">
            Osaka
          </Text>
        </Row>

        <Row gap={8}>
          <Pill active size="sm">
            Itinerary
          </Pill>
          <Pill size="sm">Checklist</Pill>
          <Pill size="sm">Recs</Pill>
        </Row>

        <BudgetBar amount="IDR 4.200.000" label="Osaka subtotal" />

        <Stack gap={8}>
          {OSAKA_SEGMENTS.map((seg, i) => (
            <div key={seg.title}>
              <SegmentRow
                time={seg.time}
                title={seg.title}
                meta={seg.meta}
                active={i === 2}
              />
            </div>
          ))}
        </Stack>

        <Card>
          <CardBody>
            <Stack gap={8}>
              <Text weight="medium">Drill deeper</Text>
              <Text size="small" tone="tertiary">
                Dotonbori memiliki sub-pipeline: 3 restoran, 1 food corner, estimasi biaya
              </Text>
              <Button variant="secondary">Buka sub-pipeline Dotonbori</Button>
            </Stack>
          </CardBody>
        </Card>

        <Row gap={8}>
          <Button variant="primary">Navigate</Button>
          <Button variant="secondary">Book</Button>
        </Row>
      </Stack>
    </PhoneFrame>
  );
}

function TodayScreen() {
  const theme = useHostTheme();
  return (
    <PhoneFrame title="Today" subtitle="Senin, 4 Okt · Osaka">
      <Stack gap={16}>
        <Card>
          <CardBody>
            <Stack gap={8}>
              <Text size="small" tone="secondary">
                Selanjutnya · 18:00
              </Text>
              <Text weight="medium">Dotonbori — Makan malam</Text>
              <Text size="small" tone="tertiary">
                Train 12 min · Halal-friendly list ready
              </Text>
              <Row gap={8}>
                <Button variant="primary">Navigate</Button>
                <Button variant="secondary">Lihat detail</Button>
              </Row>
            </Stack>
          </CardBody>
        </Card>

        <Stack gap={8}>
          <Text size="small" tone="secondary">
            Hari ini
          </Text>
          <SegmentRow time="09:00" title="Osaka Castle" meta="Selesai · ¥600" />
          <SegmentRow time="14:00" title="Shinsaibashi shopping" meta="Selesai · 2 jam" active />
          <SegmentRow time="18:00" title="Dotonbori" meta="Upcoming · ~¥2.000" />
          <SegmentRow time="19:00" title="Food Tour" meta="Upcoming · ¥8.500" />
        </Stack>

        <div
          style={{
            padding: 14,
            borderRadius: 10,
            border: `1px solid ${theme.stroke.secondary}`,
            background: theme.fill.quaternary,
          }}
        >
          <Row align="start" gap={10}>
            <div
              style={{
                width: 4,
                height: 40,
                borderRadius: 2,
                background: theme.accent.primary,
                flexShrink: 0,
              }}
            />
            <Stack gap={4}>
              <Text weight="medium">Cuaca: Hujan ringan 60%</Text>
              <Text size="small" tone="tertiary">
                AI menyarankan bawa payung. Outdoor activity di Day 5 sudah disesuaikan.
              </Text>
              <Button variant="secondary">Lihat perubahan pipeline</Button>
            </Stack>
          </Row>
        </div>
      </Stack>
    </PhoneFrame>
  );
}

function ProfileScreen() {
  return (
    <PhoneFrame title="Preferences" subtitle="Personalization">
      <Stack gap={16}>
        <Stack gap={10}>
          <Text weight="medium">Travel style</Text>
          <Row gap={8} wrap>
            {["Budaya", "Kuliner", "Shopping", "Nature"].map((t, i) => (
              <span key={t}>
                <Pill active={i < 2} size="sm">
                  {t}
                </Pill>
              </span>
            ))}
          </Row>
        </Stack>

        <Stack gap={8}>
          <Text weight="medium">Budget range</Text>
          <Text size="small" tone="tertiary">
            IDR 20.000.000 – 35.000.000 per trip
          </Text>
        </Stack>

        <Row align="center" justify="space-between">
          <Stack gap={2}>
            <Text weight="medium">Halal-friendly</Text>
            <Text size="small" tone="tertiary">
              Prioritaskan opsi makan halal
            </Text>
          </Stack>
          <Toggle checked />
        </Row>

        <Row align="center" justify="space-between">
          <Stack gap={2}>
            <Text weight="medium">Pace</Text>
            <Text size="small" tone="tertiary">
              Moderate — 4–5 aktivitas/hari
            </Text>
          </Stack>
        </Row>
        <Row gap={8}>
          {["Santai", "Moderate", "Padat"].map((p, i) => (
            <span key={p}>
              <Pill active={i === 1} size="sm">
                {p}
              </Pill>
            </span>
          ))}
        </Row>

        <Divider />

        <Button variant="primary">Simpan preferensi</Button>
      </Stack>
    </PhoneFrame>
  );
}

function DesignSystemPanel() {
  const theme = useHostTheme();
  const principles = [
    {
      title: "Progressive disclosure",
      desc: "Tampilkan macro pipeline dulu. Detail muncul saat user tap — tidak overwhelm di awal.",
    },
    {
      title: "Satu fokus per layar",
      desc: "Home = mulai trip. Pipeline = overview. Checkpoint = detail hari ini. Today = action mode.",
    },
    {
      title: "Context selalu visible",
      desc: "Breadcrumb, budget bar, dan progress trip sticky — user tidak pernah 'lost'.",
    },
    {
      title: "Tap to drill-down",
      desc: "Setiap node bisa expand jadi sub-pipeline. Depth unlimited, UX tetap 1 level per screen.",
    },
  ];

  const tokens: { label: string; style: CSSProperties }[] = [
    { label: "Accent", style: { background: theme.accent.primary } },
    { label: "Surface", style: { background: theme.bg.elevated, border: `1px solid ${theme.stroke.tertiary}` } },
    { label: "Fill", style: { background: theme.fill.tertiary } },
    { label: "Text primary", style: { background: theme.text.primary } },
  ];

  return (
    <Stack gap={20}>
      <Grid columns={2} gap={16}>
        <Stack gap={12}>
          <H2>Design principles</H2>
          {principles.map((p) => (
            <div key={p.title}>
            <Stack gap={4}>
              <Text weight="medium">{p.title}</Text>
              <Text size="small" tone="tertiary">
                {p.desc}
              </Text>
            </Stack>
            </div>
          ))}
        </Stack>

        <Stack gap={12}>
          <H2>Visual language</H2>
          <Text size="small" tone="secondary">
            Modern, flat, generous whitespace. Accent color untuk active state & CTA saja.
          </Text>
          <Row gap={10}>
            {tokens.map((t) => (
              <div key={t.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: 48, height: 48, borderRadius: 8, ...t.style }} />
                <Text size="small" tone="tertiary">
                  {t.label}
                </Text>
              </div>
            ))}
          </Row>

          <Divider />

          <H3>Typography scale</H3>
          <Stack gap={6}>
            <Text weight="medium" style={{ fontSize: 24 }}>
              Display — Trip title
            </Text>
            <Text weight="medium" style={{ fontSize: 18 }}>
              Heading — Checkpoint name
            </Text>
            <Text>Body — Segment details</Text>
            <Text size="small" tone="tertiary">
              Caption — Meta, timestamps
            </Text>
          </Stack>

          <Divider />

          <H3>Navigation (4 tabs max)</H3>
          <Row gap={16}>
            <Stat label="Home" value="Start & trips" />
            <Stat label="Journey" value="Pipeline tree" />
            <Stat label="Today" value="Live mode" />
            <Stat label="Profile" value="Preferences" />
          </Row>
        </Stack>
      </Grid>

      <CollapsibleSection title="UX flows" defaultOpen>
        <Grid columns={3} gap={12}>
          {[
            {
              flow: "New trip",
              steps: "Home → AI chat → Planning loader → Review pipeline → Activate",
            },
            {
              flow: "Explore checkpoint",
              steps: "Journey spine → Tap Osaka → Sub-pipeline → Tap POI → Sub-sub-pipeline",
            },
            {
              flow: "Live disruption",
              steps: "Today alert → View diff → Accept replan → Updated subtree only",
            },
          ].map((f) => (
            <div key={f.flow}>
              <Card>
                <CardHeader>{f.flow}</CardHeader>
                <CardBody>
                  <Text size="small" tone="tertiary">
                    {f.steps}
                  </Text>
                </CardBody>
              </Card>
            </div>
          ))}
        </Grid>
      </CollapsibleSection>

      <CollapsibleSection title="Component inventory">
        <Grid columns={4} gap={8}>
          {[
            "PipelineSpine",
            "SegmentCard",
            "BudgetBar",
            "Breadcrumb",
            "SideModuleTabs",
            "AlertBanner",
            "PlanningLoader",
            "BookCTA",
            "MapSplitView",
            "DiffViewer",
          ].map((c) => (
            <span key={c}>
              <Pill size="sm">{c}</Pill>
            </span>
          ))}
        </Grid>
      </CollapsibleSection>
    </Stack>
  );
}

function renderScreen(screen: Screen) {
  switch (screen) {
    case "home":
      return <HomeScreen />;
    case "planning":
      return <PlanningScreen />;
    case "pipeline":
      return <PipelineScreen />;
    case "checkpoint":
      return <CheckpointScreen />;
    case "today":
      return <TodayScreen />;
    case "profile":
      return <ProfileScreen />;
    default:
      return null;
  }
}

export default function TravelAgentUIUX() {
  const [screen, setScreen] = useCanvasState<Screen>("activeScreen", "overview");

  return (
    <Stack gap={24}>
      <Stack gap={8}>
        <H1>Traverior — UI/UX Design</H1>
        <Text tone="secondary">
          Interactive prototype · Simple UX · Modern flat design · Recursive pipeline navigation
        </Text>
      </Stack>

      <ScreenNav active={screen} onChange={setScreen} />

      {screen === "overview" ? (
        <DesignSystemPanel />
      ) : (
        <Row gap={24} align="start" wrap>
          {renderScreen(screen)}
          <Stack gap={16} style={{ flex: 1, minWidth: 280, maxWidth: 420 }}>
            <H2>Screen notes</H2>
            {screen === "home" && (
              <Stack gap={8}>
                <Text weight="medium">Goal: zero friction start</Text>
                <Text size="small" tone="tertiary">
                  Satu input besar + CTA primary. Trip aktif langsung visible. Quick-start chips untuk
                  user yang belum punya ide spesifik.
                </Text>
              </Stack>
            )}
            {screen === "planning" && (
              <Stack gap={8}>
                <Text weight="medium">Goal: trust the AI</Text>
                <Text size="small" tone="tertiary">
                  Transparent loading steps menunjukkan tool/API yang dipanggil. Preview pipeline muncul
                  sebelum user commit — mengurangi anxiety.
                </Text>
              </Stack>
            )}
            {screen === "pipeline" && (
              <Stack gap={8}>
                <Text weight="medium">Goal: bird-eye view</Text>
                <Text size="small" tone="tertiary">
                  Vertical spine mirror diagram workflow. Active checkpoint highlighted. Side modules
                  (checklist, recs) accessible tanpa masuk detail.
                </Text>
              </Stack>
            )}
            {screen === "checkpoint" && (
              <Stack gap={8}>
                <Text weight="medium">Goal: one level at a time</Text>
                <Text size="small" tone="tertiary">
                  Breadcrumb untuk orientasi. Segments ordered by time. Setiap POI bisa drill-down lagi
                  ke sub-pipeline (Dotonbori → restaurants).
                </Text>
              </Stack>
            )}
            {screen === "today" && (
              <Stack gap={8}>
                <Text weight="medium">Goal: action-first during trip</Text>
                <Text size="small" tone="tertiary">
                  &quot;Selanjutnya&quot; card paling prominent. Alert disruption inline dengan action
                  Accept/View diff — tidak modal blocking.
                </Text>
              </Stack>
            )}
            {screen === "profile" && (
              <Stack gap={8}>
                <Text weight="medium">Goal: set once, apply everywhere</Text>
                <Text size="small" tone="tertiary">
                  Preferensi dalam bahasa manusia (pill toggles), bukan form panjang. AI baca ini saat
                  planning & replanning.
                </Text>
              </Stack>
            )}
          </Stack>
        </Row>
      )}
    </Stack>
  );
}
