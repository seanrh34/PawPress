interface ToggleProps {
    leftChoice: string;
    rightChoice: string;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
}

export default function Toggle({ leftChoice, rightChoice, checked = false, onChange }: ToggleProps) {
    return (
        <label className="inline-flex items-center cursor-pointer">
            <span className="select-none text-sm font-medium text-gray-700">{leftChoice}</span>
            <input 
                type="checkbox" 
                checked={checked}
                onChange={(e) => onChange?.(e.target.checked)}
                className="sr-only peer" 
            />
            <div className="relative mx-3 w-9 h-5 bg-gray-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-200 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
            <span className="select-none text-sm font-medium text-gray-700">{rightChoice}</span>
        </label>
    );
}