/**
 * Component tests for the save-time ExplanationCard.
 *
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ExplanationCard } from '../ExplanationCard';

describe('ExplanationCard', () => {
  it('renders nothing when explanation is absent', () => {
    const { container } = render(<ExplanationCard />);
    expect(container.innerHTML).toBe('');
  });

  it('renders nothing for a blank explanation', () => {
    const { container } = render(<ExplanationCard explanation="   " />);
    expect(container.innerHTML).toBe('');
  });

  it('renders a collapsible rationale when explanation is present', () => {
    render(<ExplanationCard explanation="A is right because it is the capital." />);
    expect(screen.getByText(/Show explanation/)).toBeTruthy();
    expect(screen.getByTestId('explanation-text').textContent).toBe(
      'A is right because it is the capital.',
    );
  });
});
