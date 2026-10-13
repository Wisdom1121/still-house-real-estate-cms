const paths = {
  'arrow-up-right': <><path d="M7 17 17 7" /><path d="M8 7h9v9" /></>,
  'arrow-left': <><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></>,
  'arrow-right': <><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>,
  'arrow-up': <><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></>,
  'arrow-down': <><path d="M12 5v14" /><path d="m19 12-7 7-7-7" /></>,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
  'more-horizontal': <><circle cx="5" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" /><circle cx="19" cy="12" r="1" fill="currentColor" stroke="none" /></>,
};

export default function Icon({ name, size = 16, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      className={`icon icon-${name} ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {paths[name]}
    </svg>
  );
}

