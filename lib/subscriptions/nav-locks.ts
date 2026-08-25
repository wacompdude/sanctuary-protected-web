import type {
  NavEntry,
  NavItemId,
  NavLinkItem,
  NavSection,
} from "@/lib/organization/navigation";
import { NAV_FEATURE_REQUIREMENTS } from "@/lib/subscriptions/nav-features";
import { FEATURE_KEYS } from "@/lib/subscriptions/feature-keys";

export type NavFeatureLockOptions = {
  enabledFeatures: ReadonlySet<string>;
  /**
   * Known Safety Concerns stays readable for security leadership after a
   * downgrade. Those users should not see the nav item as tier-locked.
   */
  keepSafetyConcernsAvailable?: boolean;
};

function requiredFeature(id: NavItemId): string | undefined {
  return NAV_FEATURE_REQUIREMENTS[id];
}

function shouldLock(id: NavItemId, options: NavFeatureLockOptions): boolean {
  const required = requiredFeature(id);
  if (!required) return false;
  if (
    required === FEATURE_KEYS.SAFETY_CONCERN_PROFILES &&
    options.keepSafetyConcernsAvailable
  ) {
    return false;
  }
  return !options.enabledFeatures.has(required);
}

function lockLink(item: NavLinkItem, options: NavFeatureLockOptions): NavLinkItem {
  const required = requiredFeature(item.id);
  if (!required || !shouldLock(item.id, options)) {
    return item;
  }
  return {
    ...item,
    locked: true,
    featureKey: required,
  };
}

function lockEntry(entry: NavEntry, options: NavFeatureLockOptions): NavEntry {
  if (entry.kind === "link") {
    return lockLink(entry, options);
  }

  const children = entry.children.map((child) => lockLink(child, options));
  const required = requiredFeature(entry.id);
  const locked = required ? shouldLock(entry.id, options) : false;

  return {
    ...entry,
    locked,
    featureKey: locked ? required : undefined,
    children,
  };
}

/** Keep gated destinations visible and mark them locked instead of hiding them. */
export function applyNavFeatureLocks(
  sections: NavSection[],
  options: NavFeatureLockOptions,
): NavSection[] {
  return sections.map((section) => ({
    ...section,
    items: section.items.map((entry) => lockEntry(entry, options)),
  }));
}
