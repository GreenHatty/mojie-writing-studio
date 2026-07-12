import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createWritingRepository, type WritingRepository } from '../lib/repository';
import { WritingStudio } from './writing-studio';

const repositories: WritingRepository[] = [];

function makeRepository(): WritingRepository {
  const repository = createWritingRepository({
    databaseName: `studio-test-${crypto.randomUUID()}`,
    ownerId: 'owner-1'
  });
  repositories.push(repository);
  return repository;
}

afterEach(async () => {
  cleanup();
  await new Promise((resolve) => setTimeout(resolve, 0));
  await Promise.all(repositories.splice(0).map((repository) => repository.destroy()));
});

describe('WritingStudio', () => {
  it('takes a first-time writer from a blank workspace directly into a chapter editor', async () => {
    const repository = makeRepository();
    render(<WritingStudio repository={repository} />);

    expect(await screen.findByRole('heading', { name: '开始第一本作品' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('作品名称'), { target: { value: '雾中长安' } });
    fireEvent.click(screen.getByRole('button', { name: '创建并开始写作' }));

    expect(await screen.findByText('第一卷')).toBeTruthy();
    expect(screen.getByText('第1章')).toBeTruthy();
    expect(screen.getByDisplayValue('第1章')).toBeTruthy();
  });

  it('shows every existing work on a dashboard and opens the selected work', async () => {
    const repository = makeRepository();
    await repository.createWork({ title: '山河既白', kind: 'long' });
    await repository.createWork({ title: '一页随笔', kind: 'essay' });

    render(<WritingStudio repository={repository} />);

    expect(await screen.findByRole('heading', { name: '我的作品' })).toBeTruthy();
    expect(screen.getByText('山河既白')).toBeTruthy();
    expect(screen.getByText('一页随笔')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: '继续写作：山河既白' }));
    expect(await screen.findByText('第一卷')).toBeTruthy();
    await waitFor(() => expect(screen.getByLabelText('正文内容')).toBeTruthy());
    expect(screen.getAllByText('山河既白').length).toBeGreaterThan(0);
  });
});
