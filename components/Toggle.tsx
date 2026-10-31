interface ToggleProps {
    leftChoice: string;
    rightChoice: string;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
}

export default function Toggle({ leftChoice, rightChoice, checked = false, onChange }: ToggleProps) {
    return (
        <label className="inline-flex cursor-pointer items-center gap-3">
            <span className="select-none text-sm font-medium text-copy-muted">{leftChoice}</span>
            <input
                type="checkbox"
                checked={checked}
                onChange={(e) => onChange?.(e.target.checked)}
                className="sr-only peer"
            />
            <div className="relative h-6 w-10 rounded-full bg-rail-strong transition-colors after:absolute after:start-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:shadow-sm after:transition-transform peer-checked:bg-copy peer-checked:after:translate-x-4 peer-focus-visible:ring-2 peer-focus-visible:ring-signal peer-focus-visible:ring-offset-2 rtl:peer-checked:after:-translate-x-4"></div>
            <span className="select-none text-sm font-medium text-copy-muted">{rightChoice}</span>
        </label>
    );
}
