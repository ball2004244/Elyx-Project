/**
 * @file Phosphor icon mapping per activity type (taste-skill 3.C: one icon
 * family, uniform weight). Centralized so blocks and legend stay consistent.
 */

import { Barbell } from '@phosphor-icons/react/dist/csr/Barbell';
import { ForkKnife } from '@phosphor-icons/react/dist/csr/ForkKnife';
import { Pill } from '@phosphor-icons/react/dist/csr/Pill';
import { Drop } from '@phosphor-icons/react/dist/csr/Drop';
import { Stethoscope } from '@phosphor-icons/react/dist/csr/Stethoscope';

const ICON = {
  fitness: Barbell,
  food: ForkKnife,
  medication: Pill,
  therapy: Drop,
  consultation: Stethoscope,
};

/**
 * Render the icon for an activity type at a uniform weight/size.
 * @param {{ type: string, size?: number, weight?: string, className?: string }} p
 */
export function TypeIcon({ type, size = 16, weight = 'duotone', className }) {
  const Cmp = ICON[type] ?? Stethoscope;
  return <Cmp size={size} weight={weight} className={className} />;
}
