<?php

namespace Components\Views\Home;

use Viewi\Components\BaseComponent;

class HomePage extends BaseComponent
{
    public string $title = 'Viewi - Reactive application for PHP';
    public bool $isLoading = false;
    public array $items = [];

    function getName(): string
    {
        return 'HomePage';
    }

    function getTitle(): string
    {
        return $this->title;
    }

    function setLoading(bool $loading): void
    {
        $this->isLoading = $loading;
    }
}
