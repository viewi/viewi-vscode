<?php

class MyButton
{
    public string $text = 'Click me';
    public bool $disabled = false;
    public string $variant = 'primary';
    
    public function onClick(): void
    {
        // Handle button click
        echo "Button clicked: " . $this->text;
    }
    
    public function getText(): string
    {
        return $this->text;
    }
    
    public function isDisabled(): bool
    {
        return $this->disabled;
    }
    
    public function getVariantClass(): string
    {
        return 'btn-' . $this->variant;
    }
}
