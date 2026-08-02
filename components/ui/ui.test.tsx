// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './button';
import { Card, CardTitle, CardBody } from './card';
import { Chip, ZoneChip } from './chip';
import { StatTile } from './stat-tile';
import { EmptyState } from './empty-state';
import { Sheet } from './sheet';

describe('Button', () => {
  it('renders its label and fires on click', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Start</Button>);
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('defaults to type="button" so it never submits a form by accident', () => {
    render(<Button>Start</Button>);
    expect(screen.getByRole('button')).toHaveAttribute('type', 'button');
  });

  it('is operable by keyboard', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>Start</Button>);
    await userEvent.tab();
    expect(screen.getByRole('button')).toHaveFocus();
    await userEvent.keyboard('{Enter}');
    expect(onClick).toHaveBeenCalled();
  });

  it('blocks interaction while loading and says so to assistive tech', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        Saving
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('keeps its label visible while loading, so the width does not jump', () => {
    render(<Button loading>Saving</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Saving');
  });

  it('exposes why it is disabled rather than being a dead end', () => {
    render(
      <Button disabled disabledReason="Finish today's session first">
        Start
      </Button>,
    );
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('title', "Finish today's session first");
    expect(button).toHaveTextContent("Finish today's session first");
  });

  it('offers a live-workout size with a 64px target', () => {
    render(<Button size="xl">Pause</Button>);
    expect(screen.getByRole('button').className).toContain('h-touch-live');
  });
});

describe('Card', () => {
  it('renders a title and body', () => {
    render(
      <Card>
        <CardTitle>Easy ride</CardTitle>
        <CardBody>Builds the aerobic base.</CardBody>
      </Card>,
    );
    expect(screen.getByRole('heading', { name: 'Easy ride' })).toBeInTheDocument();
    expect(screen.getByText('Builds the aerobic base.')).toBeInTheDocument();
  });

  it('hides the decorative discipline stripe from assistive tech', () => {
    const { container } = render(<Card stripeColor="#eb6834">Ride</Card>);
    const stripe = container.querySelector('[aria-hidden="true"]');
    expect(stripe).not.toBeNull();
    expect(stripe).toHaveStyle({ backgroundColor: '#eb6834' });
  });
});

describe('Chip', () => {
  it('renders its content', () => {
    render(<Chip>45 min</Chip>);
    expect(screen.getByText('45 min')).toBeInTheDocument();
  });

  it('always states the zone number and word, never colour alone', () => {
    render(<ZoneChip zone={4} label="Hard" />);
    expect(screen.getByText(/Zone 4/)).toBeInTheDocument();
    expect(screen.getByText(/Hard/)).toBeInTheDocument();
  });
});

describe('StatTile', () => {
  it('shows a label, value and unit', () => {
    render(<StatTile label="Hours trained" value="18.4" unit="h" />);
    expect(screen.getByText('Hours trained')).toBeInTheDocument();
    expect(screen.getByText('18.4')).toBeInTheDocument();
    expect(screen.getByText('h')).toBeInTheDocument();
  });

  it('marks a rise with an arrow and a sign, not just colour', () => {
    const { container } = render(<StatTile label="Fitness" value="62" delta={{ value: 8.2 }} />);
    expect(container.textContent).toContain('↑');
    expect(container.textContent).toContain('+8.2%');
  });

  it('treats a rise as bad when a rise is bad', () => {
    const { container } = render(
      <StatTile label="Resting HR" value="54" delta={{ value: 4, riseIsGood: false }} />,
    );
    expect(container.querySelector('.text-critical')).not.toBeNull();
  });

  it('omits the delta entirely when there is no change', () => {
    const { container } = render(<StatTile label="Sessions" value="12" delta={{ value: 0 }} />);
    expect(container.textContent).not.toContain('↑');
    expect(container.textContent).not.toContain('↓');
  });
});

describe('EmptyState', () => {
  it('explains what will appear rather than saying "no data"', () => {
    render(
      <EmptyState
        title="Nothing to show yet"
        description="This fills up once you have logged a few sessions."
      />,
    );
    expect(screen.getByRole('heading', { name: 'Nothing to show yet' })).toBeInTheDocument();
    expect(screen.getByText(/once you have logged/)).toBeInTheDocument();
  });
});

describe('Sheet', () => {
  it('is not in the document when closed', () => {
    render(
      <Sheet open={false} onOpenChange={() => undefined} title="Alternatives">
        <p>Shorter version</p>
      </Sheet>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('renders as a modal dialog with an accessible name', () => {
    render(
      <Sheet open onOpenChange={() => undefined} title="Alternatives">
        <p>Shorter version</p>
      </Sheet>,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeInTheDocument();
    expect(dialog).toHaveAccessibleName('Alternatives');
  });

  it('closes on Escape', async () => {
    const onOpenChange = vi.fn();
    render(
      <Sheet open onOpenChange={onOpenChange} title="Alternatives">
        <p>Shorter version</p>
      </Sheet>,
    );
    await userEvent.keyboard('{Escape}');
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('keeps its accessible name even when the title is visually hidden', () => {
    render(
      <Sheet open onOpenChange={() => undefined} title="Skip reason" hideTitle>
        <p>Why are you skipping?</p>
      </Sheet>,
    );
    expect(screen.getByRole('dialog')).toHaveAccessibleName('Skip reason');
  });
});
