import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CreateWorkForm } from './create-work-form';

describe('CreateWorkForm', () => {
  it('submits the selected writing type and title in one step', () => {
    const onCreate = vi.fn();
    render(<CreateWorkForm onCreate={onCreate} />);

    fireEvent.change(screen.getByLabelText('作品名称'), { target: { value: '雾中长安' } });
    fireEvent.change(screen.getByLabelText('作品类型'), { target: { value: 'short' } });
    fireEvent.click(screen.getByRole('button', { name: '创建并开始写作' }));

    expect(onCreate).toHaveBeenCalledWith({ title: '雾中长安', kind: 'short' });
  });
});
