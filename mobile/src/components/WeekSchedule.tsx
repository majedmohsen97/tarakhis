import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { api } from '@/lib/api';
import { useApi } from '@/lib/hooks';
import { useI18n } from '@/lib/i18n';
import { confirm, notify } from '@/lib/dialog';
import { addDays, dayIndex, fmtDate, todayIso, weekStartOf } from '@/lib/format';
import { colors, radius, space } from '@/lib/theme';
import type { ScheduleEntry } from '@/lib/types';
import { Button, Card, Empty, ErrorBox, Icon, Loading, Pill, Row, Txt, useDir } from './ui';

type WeekData = { week_start: string; week_end: string; today: string; entries: ScheduleEntry[] };

/**
 * The weekly plan. `mode` decides what each role sees:
 *  - manage: office staff, can add/remove rows and copy the week
 *  - gate: today's expected trucks, with whether they already entered
 *  - driver: the driver's own week
 */
export function WeekSchedule({ mode }: { mode: 'manage' | 'gate' | 'driver' }) {
  const { t, lang, errorText } = useI18n();
  const { row } = useDir();
  const [week, setWeek] = useState(weekStartOf(todayIso()));
  const [day, setDay] = useState(todayIso());
  const data = useApi<WeekData>(`/schedule?week_start=${week}`);
  const entries = (data.data?.entries ?? []).filter((e) => e.date === day);
  const days = Array.from({ length: 7 }, (_, i) => addDays(week, i));

  function moveWeek(delta: number) {
    const next = addDays(week, delta * 7);
    setWeek(next);
    setDay(delta === 0 ? todayIso() : next);
  }

  async function remove(entry: ScheduleEntry) {
    if (!(await confirm(t.common.delete, `${entry.driver_name} · ${fmtDate(entry.date, lang)}`, t.common.delete, t.common.cancel, true))) return;
    try {
      await api(`/schedule/${entry.id}`, { method: 'DELETE' });
      data.reload();
    } catch (e) {
      notify(errorText(e));
    }
  }

  async function copyWeek() {
    try {
      const res = await api<{ copied: number }>('/schedule/copy-week', { method: 'POST', body: { from_week_start: week, to_week_start: addDays(week, 7) } });
      notify(t.schedule.copied(res.copied));
      moveWeek(1);
    } catch (e) {
      notify(errorText(e));
    }
  }

  return (
    <View>
      <Row justify="space-between" style={{ marginBottom: space.sm }}>
        <Button small variant="ghost" icon={lang === 'ar' ? 'chevron-forward' : 'chevron-back'} label={t.schedule.prevWeek} onPress={() => moveWeek(-1)} />
        <Pressable onPress={() => moveWeek(0)}>
          <Txt weight="700">{`${fmtDate(week, lang)} – ${fmtDate(addDays(week, 6), lang)}`}</Txt>
        </Pressable>
        <Button small variant="ghost" icon={lang === 'ar' ? 'chevron-back' : 'chevron-forward'} label={t.schedule.nextWeek} onPress={() => moveWeek(1)} />
      </Row>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ flexDirection: row, gap: 6, paddingBottom: space.sm, flexGrow: 1 }}>
        {days.map((d) => {
          const active = d === day;
          const count = (data.data?.entries ?? []).filter((e) => e.date === d).length;
          const isToday = d === todayIso();
          return (
            <Pressable key={d} onPress={() => setDay(d)} style={[styles.day, active && styles.dayActive, isToday && !active && styles.dayToday]}>
              <Text style={[styles.dayName, active && { color: colors.white }]}>{t.days[dayIndex(d)]}</Text>
              <Text style={[styles.dayNum, active && { color: colors.white }]}>{d.slice(8)}</Text>
              <Text style={[styles.dayCount, active && { color: colors.primarySoft }]}>{count || '–'}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {mode === 'manage' ? (
        <Row gap={space.sm} style={{ marginBottom: space.md }}>
          <Button label={t.schedule.add} icon="add" onPress={() => router.push({ pathname: '/schedule/new', params: { date: day } })} style={{ flex: 1 }} />
          <Button label={t.schedule.copyWeek} icon="copy-outline" variant="secondary" onPress={copyWeek} style={{ flex: 1 }} />
        </Row>
      ) : null}

      {data.error ? <ErrorBox error={data.error} onRetry={data.reload} /> : null}
      {data.loading ? (
        <Loading />
      ) : entries.length ? (
        entries.map((e) => (
          <Card key={e.id}>
            <Row justify="space-between" align="flex-start">
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="700">{mode === 'driver' ? e.site_name ?? '—' : e.driver_name}</Txt>
                <Txt variant="small">{[e.plate_number, mode === 'driver' ? null : e.site_name, t.schedule.shifts[e.shift]].filter(Boolean).join(' · ')}</Txt>
                {e.notes ? <Txt variant="small">{e.notes}</Txt> : null}
              </View>
              <View style={{ alignItems: 'center', gap: 6 }}>
                <Pill label={t.schedule.trips(e.completed_trips, e.planned_trips)} tone={e.completed_trips >= e.planned_trips ? 'good' : 'neutral'} />
                {mode === 'gate' && e.gate_entries > 0 ? <Pill label={t.schedule.entered} tone="good" icon="checkmark" /> : null}
                {mode === 'manage' ? (
                  <Pressable onPress={() => remove(e)} hitSlop={10} accessibilityLabel={t.common.delete}>
                    <Icon name="trash-outline" size={18} color={colors.bad} />
                  </Pressable>
                ) : null}
              </View>
            </Row>
          </Card>
        ))
      ) : (
        <Empty text={t.schedule.empty} icon="calendar-clear-outline" />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  day: { minWidth: 64, flexGrow: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.line },
  dayActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  dayToday: { borderColor: colors.primary },
  dayName: { fontSize: 11, color: colors.muted, fontWeight: '600' },
  dayNum: { fontSize: 18, fontWeight: '800', color: colors.text },
  dayCount: { fontSize: 11, color: colors.muted },
});
