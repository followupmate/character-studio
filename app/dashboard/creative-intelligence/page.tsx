/**
 * Creative Intelligence Dashboard Page
 * Path: /dashboard/creative-intelligence
 */

import CreativeIntelligenceDashboard from '@/components/CreativeIntelligenceDashboard';

export const metadata = {
  title: 'Creative Intelligence | Character Studio',
  description: 'What works on Instagram, why, and what content to make next'
};

export default function CreativeIntelligencePage() {
  return (
    <main className="bg-gray-50 min-h-screen">
      <CreativeIntelligenceDashboard />
    </main>
  );
}
