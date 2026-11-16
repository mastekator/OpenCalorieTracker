import './Mark.css';

/**
 * The app mark (logo «Macro peas», OCT-217): pod and three peas — protein, fat, carbs. Colours follow the theme.
 * Parts are grouped so ui/Splash can move them: body (whole pod), hinge (lid + stem), peas.
 */
export function Mark({ className }: { className?: string }) {
  return (
    <svg
      className={className ? `mark ${className}` : 'mark'}
      viewBox="0 0 100 100"
      aria-hidden="true"
    >
      <g className="mark__body">
        <path
          className="mark__pod"
          d="M6 50C22 86 78 86 94 48C76 66 24 66 6 50Z"
        />
        <g className="mark__hinge">
          <path
            className="mark__pod mark__lid"
            d="M6 46C20 20 66 12 92 34C70 26 30 30 6 46Z"
          />
          {/* Drawn before the peas now (it moves with the lid); it never overlaps them. */}
          <path className="mark__stem" d="M92 34c3-4 4-9 2-13" />
        </g>
        <g className="mark__peas">
          <circle className="mark__protein" cx="29" cy="54" r="10" />
          <circle className="mark__fat" cx="50" cy="57" r="10.5" />
          <circle className="mark__carbs" cx="71" cy="54" r="10" />
        </g>
      </g>
    </svg>
  );
}
