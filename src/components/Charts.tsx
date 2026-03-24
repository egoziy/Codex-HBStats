'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function ChartCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[24px] border border-stone-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-xl font-black text-stone-900">{title}</h2>
      <div className="h-[320px] w-full">{children}</div>
    </section>
  );
}

export function TeamChartsView({
  goalsByMatchday,
  pointsProgress,
  resultBreakdown,
  topScorers,
  topAssisters,
}: {
  goalsByMatchday: Array<{ מחזור: string; זכות: number; חובה: number }>;
  pointsProgress: Array<{ מחזור: string; נקודות: number }>;
  resultBreakdown: Array<{ name: string; value: number }>;
  topScorers: Array<{ שחקן: string; שערים: number }>;
  topAssisters: Array<{ שחקן: string; בישולים: number }>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <ChartCard title="שערי זכות מול שערי חובה לפי מחזור">
        <ResponsiveContainer>
          <LineChart data={goalsByMatchday}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="מחזור" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="זכות" stroke="#b91c1c" strokeWidth={3} />
            <Line type="monotone" dataKey="חובה" stroke="#111827" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="צבירת נקודות לאורך העונה">
        <ResponsiveContainer>
          <LineChart data={pointsProgress}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="מחזור" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Line type="monotone" dataKey="נקודות" stroke="#ca8a04" strokeWidth={3} />
          </LineChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="התפלגות ניצחונות / תיקו / הפסדים">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={resultBreakdown} dataKey="value" nameKey="name" outerRadius={100} fill="#b91c1c" label />
            <Tooltip />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="חמשת הכובשים המובילים">
        <ResponsiveContainer>
          <BarChart data={topScorers}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="שחקן" interval={0} angle={-12} textAnchor="end" height={80} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="שערים" fill="#b91c1c" radius={[8, 8, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard title="חמשת המבשלים המובילים">
          <ResponsiveContainer>
            <BarChart data={topAssisters}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="שחקן" interval={0} angle={-12} textAnchor="end" height={80} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="בישולים" fill="#1d4ed8" radius={[8, 8, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

export function PlayerChartsView({
  goalsAssists,
  minutesPlayed,
  cards,
}: {
  goalsAssists: Array<{ עונה: string; שערים: number; בישולים: number }>;
  minutesPlayed: Array<{ עונה: string; דקות: number }>;
  cards: Array<{ עונה: string; צהובים: number; אדומים: number }>;
}) {
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <ChartCard title="שערים ובישולים לפי עונה">
        <ResponsiveContainer>
          <BarChart data={goalsAssists}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="עונה" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="שערים" fill="#b91c1c" />
            <Bar dataKey="בישולים" fill="#1d4ed8" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="דקות משחק לפי עונה">
        <ResponsiveContainer>
          <BarChart data={minutesPlayed}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="עונה" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="דקות" fill="#0f766e" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      <ChartCard title="כרטיסים לפי עונה">
        <ResponsiveContainer>
          <BarChart data={cards}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="עונה" />
            <YAxis />
            <Tooltip />
            <Legend />
            <Bar dataKey="צהובים" stackId="cards" fill="#eab308" />
            <Bar dataKey="אדומים" stackId="cards" fill="#b91c1c" />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
