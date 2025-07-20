<?php

class TestCompletion
{
    public string $title = 'Test Title';
    public bool $isActive = true;
    
    function getName(): string
    {
        return 'TestCompletion';
    }
    
    function getTitle(): string
    {
        return $this->title;
    }
    
    function setActive(bool $active): void
    {
        $this->isActive = $active;
    }
}
