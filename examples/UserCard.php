<?php

class UserCard
{
    public string $name = '';
    public string $email = '';
    public string $avatar = '';
    public bool $isOnline = false;
    
    public function getInitials(): string
    {
        $parts = explode(' ', $this->name);
        $initials = '';
        foreach ($parts as $part) {
            $initials .= strtoupper(substr($part, 0, 1));
        }
        return $initials;
    }
    
    public function getStatusClass(): string
    {
        return $this->isOnline ? 'status-online' : 'status-offline';
    }
    
    public function formatEmail(): string
    {
        return strtolower($this->email);
    }
}
