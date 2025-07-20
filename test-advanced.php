<?php

namespace Components\Test;

use Viewi\Components\BaseComponent;

class TestAdvanced extends BaseComponent
{
    public string $title = 'Advanced Test Component';
    public string $cssClass = 'test-component';
    public bool $isActive = true;
    public string $dataValue = 'test-data';
    public string $theme = 'dark';
    public string $content = 'Sample content';
    public string $dynamicAttr = 'data-dynamic';
    
    function getName(): string
    {
        return 'TestAdvanced';
    }
    
    function getTitle(): string
    {
        return $this->title;
    }
    
    function getStatus(): string
    {
        return $this->isActive ? 'Active' : 'Inactive';
    }
    
    function handleClick(): void
    {
        $this->isActive = !$this->isActive;
    }
}
