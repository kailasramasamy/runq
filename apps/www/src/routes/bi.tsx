import { useEffect } from 'react';
import { LayoutDashboard, TrendingUp, BarChart3, Sparkles } from 'lucide-react';
import { ComingSoon } from '@/components/sections/coming-soon';

const FEATURES = [
  {
    icon: <LayoutDashboard className="size-5" />,
    title: 'Live Dashboards',
    description: 'Drag-and-drop dashboards with real-time data. Share with your team or investors in one click.',
  },
  {
    icon: <TrendingUp className="size-5" />,
    title: 'Cash Flow Forecasting',
    description: 'AI-driven 90-day cash flow projections based on your AR, AP, and historical patterns.',
  },
  {
    icon: <BarChart3 className="size-5" />,
    title: 'Custom Reports',
    description: 'Build any report without SQL — filter, group, and export to Excel, PDF, or the GST portal.',
  },
  {
    icon: <Sparkles className="size-5" />,
    title: 'AI Insights',
    description: 'Natural language queries over your own data. Ask "What was my best month?" and get an answer.',
  },
];

export default function BI() {
  useEffect(() => { document.title = 'Business Intelligence — runQ'; }, []);

  return (
    <ComingSoon
      title="Real-time Business Intelligence"
      subtitle="Ditch the spreadsheets. Get live dashboards, AI-powered forecasting, and custom reports — all connected to the data you already have in runQ."
      launchDate="Q4 2026"
      features={FEATURES}
      moduleName="BI"
    />
  );
}
