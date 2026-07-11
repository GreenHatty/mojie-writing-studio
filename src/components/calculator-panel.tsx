'use client';

import { useState } from 'react';
import {
  calculateAge,
  calculateCompoundGrowth,
  calculateTravel,
  evaluateExpression,
  probabilityAtLeastOne
} from '../lib/calculator';

type CalculatorMode = 'expression' | 'travel' | 'age' | 'growth' | 'probability';

export function CalculatorPanel() {
  const [mode, setMode] = useState<CalculatorMode>('expression');
  const [values, setValues] = useState<Record<string, string>>({
    expression: '2 + 3 * 4',
    distance: '120', speed: '30', restPercent: '25',
    birthDate: '2000-01-01', storyDate: '2026-01-01',
    initial: '100', rate: '10', periods: '5',
    probability: '1', attempts: '100'
  });
  const [result, setResult] = useState('');

  function update(key: string, value: string) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function calculate() {
    try {
      if (mode === 'expression') setResult(String(evaluateExpression(values.expression ?? '')));
      if (mode === 'travel') {
        const travel = calculateTravel({
          distance: Number(values.distance),
          speed: Number(values.speed),
          restPercent: Number(values.restPercent)
        });
        setResult(`移动 ${travel.movingHours.toFixed(2)} 小时；含休息共 ${travel.totalHours.toFixed(2)} 小时`);
      }
      if (mode === 'age') setResult(`${calculateAge(values.birthDate ?? '', values.storyDate ?? '')} 岁`);
      if (mode === 'growth') {
        const value = calculateCompoundGrowth(Number(values.initial), Number(values.rate) / 100, Number(values.periods));
        setResult(value.toFixed(4).replace(/\.0+$/u, ''));
      }
      if (mode === 'probability') {
        const value = probabilityAtLeastOne(Number(values.probability) / 100, Number(values.attempts));
        setResult(`${(value * 100).toFixed(4)}%`);
      }
    } catch (error) {
      setResult(error instanceof Error ? error.message : '计算失败');
    }
  }

  return (
    <section className="calculator-panel">
      <div className="panel-section-heading">
        <div>
          <p className="eyebrow">数值计算</p>
          <h2>小说设定计算器</h2>
        </div>
      </div>
      <label>
        <span>计算类型</span>
        <select onChange={(event) => { setMode(event.target.value as CalculatorMode); setResult(''); }} value={mode}>
          <option value="expression">基础公式</option>
          <option value="travel">距离 / 速度 / 旅程</option>
          <option value="age">人物年龄</option>
          <option value="growth">复合增长</option>
          <option value="probability">多次尝试概率</option>
        </select>
      </label>

      {mode === 'expression' ? <label><span>公式</span><input onChange={(event) => update('expression', event.target.value)} value={values.expression} /></label> : null}
      {mode === 'travel' ? (
        <div className="calculator-grid">
          <label><span>距离</span><input onChange={(event) => update('distance', event.target.value)} type="number" value={values.distance} /></label>
          <label><span>速度/小时</span><input onChange={(event) => update('speed', event.target.value)} type="number" value={values.speed} /></label>
          <label><span>休息增加%</span><input onChange={(event) => update('restPercent', event.target.value)} type="number" value={values.restPercent} /></label>
        </div>
      ) : null}
      {mode === 'age' ? (
        <div className="calculator-grid">
          <label><span>出生日期</span><input onChange={(event) => update('birthDate', event.target.value)} type="date" value={values.birthDate} /></label>
          <label><span>故事日期</span><input onChange={(event) => update('storyDate', event.target.value)} type="date" value={values.storyDate} /></label>
        </div>
      ) : null}
      {mode === 'growth' ? (
        <div className="calculator-grid">
          <label><span>初始值</span><input onChange={(event) => update('initial', event.target.value)} type="number" value={values.initial} /></label>
          <label><span>每期增长%</span><input onChange={(event) => update('rate', event.target.value)} type="number" value={values.rate} /></label>
          <label><span>期数</span><input onChange={(event) => update('periods', event.target.value)} type="number" value={values.periods} /></label>
        </div>
      ) : null}
      {mode === 'probability' ? (
        <div className="calculator-grid">
          <label><span>单次概率%</span><input onChange={(event) => update('probability', event.target.value)} type="number" value={values.probability} /></label>
          <label><span>尝试次数</span><input onChange={(event) => update('attempts', event.target.value)} type="number" value={values.attempts} /></label>
        </div>
      ) : null}
      <div className="calculator-footer">
        <button onClick={calculate} type="button">计算</button>
        <output>{result || '结果会显示在这里'}</output>
      </div>
    </section>
  );
}
