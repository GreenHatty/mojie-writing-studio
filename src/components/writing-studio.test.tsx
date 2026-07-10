import 'fake-indexeddb/auto';
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { createWritingRepository, type WritingRepository } from '../lib/repository';
import { WritingStudio } from './writing-studio';

const repositories: WritingRepository[] = [];

afterEach(async () => {
  await Promise.all(repositories.splice(0).map((repository) => repository.destroy()));
});

describe('WritingStudio', () => {
  it('takes a first-time writer from a blank workspace directly into a chapter editor', async () => {
    const repository = createWritingRepository({
      databaseName: `studio-test-${crypto.randomUUID()}`,
      ownerId: 'owner-1'
    });
    repositories.push(repository);
    render(<WritingStudio repository={repository} />);

    expect(await screen.findByRole('heading', { name: '开始第一本作品' })).toBeTruthy();
    fireEvent.change(screen.getByLabelText('作品名称'), { target: { value: '雾中长安' } });
    fireEvent.click(screen.getByRole('button', { name: '创建并开始写作' }));

    expect(await screen.findByText('第一卷')).toBeTruthy();
    expect(screen.getByText('第1章')).toBeTruthy();
    expect(screen.getByDisplayValue('第1章')).toBeTruthy();
  });
});
