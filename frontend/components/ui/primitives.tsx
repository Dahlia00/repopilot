import Link from 'next/link';
import type {ButtonHTMLAttributes, ComponentProps, HTMLAttributes, InputHTMLAttributes, ReactNode} from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'github';
type ButtonSize = 'small' | 'default' | 'large';
type Tone = 'neutral' | 'success' | 'warning' | 'danger';
const classes = (...values: (string | undefined)[]) => values.filter(Boolean).join(' ');

export function Button({variant = 'primary', size = 'default', className, type = 'button', ...props}:
  ButtonHTMLAttributes<HTMLButtonElement> & {variant?: ButtonVariant; size?: ButtonSize}) {
  return <button {...props} type={type} className={classes('ds-button', className)} data-variant={variant} data-size={size} />;
}
export function ButtonLink({variant = 'primary', size = 'default', className, ...props}:
  ComponentProps<typeof Link> & {variant?: ButtonVariant; size?: ButtonSize}) {
  return <Link {...props} className={classes('ds-button', className)} data-variant={variant} data-size={size} />;
}
export function IconButton({label, children, className, variant = 'ghost', ...props}:
  Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & {label: string; children: ReactNode; variant?: ButtonVariant; size?: ButtonSize}) {
  return <Button {...props} variant={variant} aria-label={label} className={classes('ds-icon-button', className)}>{children}</Button>;
}
export function Input({monospace = false, className, ...props}: InputHTMLAttributes<HTMLInputElement> & {monospace?: boolean}) {
  return <input {...props} className={classes('ds-input', className)} data-mono={monospace} />;
}
export function StatusChip({children, tone = 'neutral', className, ...props}: HTMLAttributes<HTMLSpanElement> & {tone?: Tone}) {
  return <span {...props} className={classes('ds-status', className)} data-tone={tone}><span className="ds-status-dot" aria-hidden="true" />{children}</span>;
}
export function SeverityIndicator({severity, className}: {severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW'; className?: string}) {
  const tone: Tone = severity === 'CRITICAL' || severity === 'HIGH' ? 'danger' : severity === 'MEDIUM' ? 'warning' : 'neutral';
  return <StatusChip tone={tone} className={className}>{severity}</StatusChip>;
}
export function CodeSurface({children, className, ...props}: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={classes('ds-code-surface', className)}>{children}</div>;
}
export function PanelHeader({title, metadata, className}: {title: string; metadata?: ReactNode; className?: string}) {
  return <div className={classes('ds-panel-header', className)}><h2>{title}</h2>{metadata}</div>;
}
export function SectionEyebrow({children, className, ...props}: HTMLAttributes<HTMLParagraphElement>) {
  return <p {...props} className={classes('ds-eyebrow', className)}>{children}</p>;
}
export function Divider({className, ...props}: HTMLAttributes<HTMLHRElement>) {
  return <hr {...props} className={classes('ds-divider', className)} />;
}
export function MonoLabel({children, className, ...props}: HTMLAttributes<HTMLSpanElement>) {
  return <span {...props} className={classes('ds-mono', className)}>{children}</span>;
}
