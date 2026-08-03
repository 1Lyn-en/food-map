import React from 'react';
import { X } from 'lucide-react';
import { useStore } from '../stores';
import {
  ResponsiveContainer, ComposedChart, Bar, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, Legend, PieChart, Pie, Cell
} from 'recharts';

const MEAL_TYPE_LABELS = {
  breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '小吃',
  afternoon_tea: '下午茶', night_snack: '夜宵'
};

export default function StatsPanel({ onClose }) {
  const { state, refreshStats, refresh, notify } = useStore();
  const stats = state.stats;
  const [statsLoading, setStatsLoading] = React.useState(!stats);

  React.useEffect(() => {
    refreshStats().catch((err) => notify(err.message)).finally(() => setStatsLoading(false));
  }, []);

  if (!stats || statsLoading) return React.createElement('div', { className: 'modal-overlay' },
    React.createElement('div', { className: 'modal modal-lg' },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, '统计概览'),
        React.createElement('button', { className: 'close-btn', onClick: onClose }, React.createElement(X, { size: 18 }))
      ),
      React.createElement('div', { className: 'modal-body', 'aria-hidden': true },
        React.createElement('div', { className: 'stats-skeleton' },
          React.createElement('div', { className: 'stats-skeleton-cards' },
            [0, 1, 2, 3, 4, 5].map((i) =>
              React.createElement('div', { key: i, className: 'skeleton skeleton-stat' })
            )
          ),
          React.createElement('div', { className: 'skeleton skeleton-chart' }),
          React.createElement('div', { className: 'skeleton skeleton-chart half' })
        )
      )
    )
  );

  const { overview, tag_distribution, meal_type_distribution, rating_distribution, price_distribution, monthly_trend } = stats;

  const recentMonths = (monthly_trend || []).slice(-12).map((m) => ({
    ...m,
    label: m.month ? m.month.slice(5) + '月' : ''
  }));

  const barColors = ['#FF5A2B', '#FF8C00', '#FFC107', '#4CAF50', '#2196F3', '#9C27B0', '#E91E63', '#00BCD4', '#795548', '#607D8B', '#FF5722', '#6D4C41'];

  return React.createElement('div', { className: 'modal-overlay', onClick: (e) => { if (e.target === e.currentTarget) onClose(); } },
    React.createElement('div', { className: 'modal modal-lg', role: 'dialog' },
      React.createElement('div', { className: 'modal-header' },
        React.createElement('h2', null, '统计概览'),
        React.createElement('button', { className: 'close-btn', onClick: onClose }, React.createElement(X, { size: 18 }))
      ),
      React.createElement('div', { className: 'modal-body' },

        // Overview cards
        React.createElement('div', { className: 'stats-cards' },
          React.createElement(StatCard, { label: '总记录', value: overview.total, icon: '📋' }),
          React.createElement(StatCard, { label: '去过的店', value: overview.restaurants, icon: '🏪' }),
          React.createElement(StatCard, { label: '总消费', value: `¥${overview.total_spent}`, icon: '💰' }),
          React.createElement(StatCard, { label: '平均评分', value: overview.avg_rating || '-', icon: '⭐' }),
          React.createElement(StatCard, { label: '本月新增', value: overview.this_month, icon: '📅' }),
          React.createElement(StatCard, { label: '收藏', value: overview.favorites, icon: '❤️' })
        ),

        // Monthly trend — ComposedChart
        React.createElement('div', { className: 'stats-section' },
          React.createElement('h3', null, '月度趋势'),
          recentMonths.length === 0
            ? React.createElement('p', { className: 'empty' }, '暂无数据')
            : React.createElement(ResponsiveContainer, { width: '100%', height: 260 },
                React.createElement(ComposedChart, { data: recentMonths },
                  React.createElement(CartesianGrid, { strokeDasharray: '3 3', stroke: 'var(--border)' }),
                  React.createElement(XAxis, { dataKey: 'label', tick: { fontSize: 11, fill: 'var(--text-muted)' }, axisLine: { stroke: 'var(--border)' }, tickLine: false }),
                  React.createElement(YAxis, { yAxisId: 'left', tick: { fontSize: 11, fill: 'var(--text-muted)' }, axisLine: false, tickLine: false, allowDecimals: false }),
                  React.createElement(YAxis, { yAxisId: 'right', orientation: 'right', tick: { fontSize: 11, fill: 'var(--text-muted)' }, axisLine: false, tickLine: false, tickFormatter: (v) => `¥${v}` }),
                  React.createElement(Tooltip, { contentStyle: { borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--card-bg)', color: 'var(--text)' }, formatter: (value, name) => name === 'total_spent' ? [`¥${value}`, '消费金额'] : [value, '记录数'] }),
                  React.createElement(Legend, { formatter: (value) => value === 'count' ? '记录数' : value === 'total_spent' ? '消费金额' : value, wrapperStyle: { color: 'var(--text)' } }),
                  React.createElement(Bar, { yAxisId: 'left', dataKey: 'count', fill: '#FF5A2B', radius: [4, 4, 0, 0], barSize: 20, name: 'count' }),
                  React.createElement(Line, { yAxisId: 'right', dataKey: 'total_spent', stroke: '#2196F3', strokeWidth: 2, dot: { r: 3, fill: '#2196F3' }, name: 'total_spent' })
                )
              )
        ),

        // Tag distribution — PieChart
        React.createElement('div', { className: 'stats-section' },
          React.createElement('h3', null, '标签分布'),
          tag_distribution.length === 0
            ? React.createElement('p', { className: 'empty' }, '暂无数据')
            : React.createElement(ResponsiveContainer, { width: '100%', height: 280 },
                React.createElement(PieChart, null,
                  React.createElement(Pie, {
                    data: tag_distribution,
                    dataKey: 'count',
                    nameKey: 'name',
                    cx: '50%',
                    cy: '50%',
                    outerRadius: 90,
                    innerRadius: 40,
                    paddingAngle: 2
                  },
                    tag_distribution.map((t) =>
                      React.createElement(Cell, { key: t.id, fill: t.color || barColors[tag_distribution.indexOf(t) % barColors.length] })
                    )
                  ),
                  React.createElement(Tooltip, { contentStyle: { borderRadius: 8, border: '1px solid var(--border)', fontSize: 12, background: 'var(--card-bg)', color: 'var(--text)' }, formatter: (value, name) => [value, name] }),
                  React.createElement(Legend, {
                    formatter: (value) => {
                      const tag = tag_distribution.find((t) => t.name === value);
                      return tag ? `${value} (${tag.count})` : value;
                    },
                    iconType: 'circle',
                    wrapperStyle: { fontSize: 12, color: 'var(--text)' }
                  })
                )
              )
        ),

        // Rating distribution
        rating_distribution.length > 0 && React.createElement('div', { className: 'stats-section' },
          React.createElement('h3', null, '评分分布'),
          React.createElement('div', { className: 'bar-chart' },
            rating_distribution.map((r) =>
              React.createElement('div', { key: r.rating, className: 'bar-row' },
                React.createElement('span', { className: 'bar-label' }, '★'.repeat(r.rating), '☆'.repeat(5 - r.rating)),
                React.createElement('div', { className: 'bar-track' },
                  React.createElement('div', { className: 'bar-fill', style: { width: `${(r.count / Math.max(...rating_distribution.map((x) => x.count))) * 100}%`, background: '#FF5A2B' } })
                ),
                React.createElement('span', { className: 'bar-value' }, r.count)
              )
            )
          )
        ),

        // Meal type distribution
        meal_type_distribution.length > 0 && React.createElement('div', { className: 'stats-section' },
          React.createElement('h3', null, '用餐类型'),
          React.createElement('div', { className: 'tag-chips' },
            meal_type_distribution.map((mt) =>
              React.createElement('span', { key: mt.meal_type, className: 'tag-chip' },
                MEAL_TYPE_LABELS[mt.meal_type] || mt.meal_type,
                React.createElement('span', { className: 'chip-count' }, mt.count)
              )
            )
          )
        ),

        // Price distribution
        price_distribution.length > 0 && React.createElement('div', { className: 'stats-section' },
          React.createElement('h3', null, '人均价格'),
          React.createElement('div', { className: 'bar-chart' },
            price_distribution.map((p) =>
              React.createElement('div', { key: p.range_label, className: 'bar-row' },
                React.createElement('span', { className: 'bar-label' }, p.range_label),
                React.createElement('div', { className: 'bar-track' },
                  React.createElement('div', { className: 'bar-fill', style: { width: `${(p.count / Math.max(...price_distribution.map((x) => x.count))) * 100}%`, background: '#4CAF50' } })
                ),
                React.createElement('span', { className: 'bar-value' }, p.count)
              )
            )
          )
        )
      )
    )
  );
}

function StatCard({ label, value, icon }) {
  return React.createElement('div', { className: 'stat-card' },
    React.createElement('span', { className: 'stat-icon' }, icon),
    React.createElement('div', { className: 'stat-info' },
      React.createElement('span', { className: 'stat-value' }, value),
      React.createElement('span', { className: 'stat-label' }, label)
    )
  );
}
