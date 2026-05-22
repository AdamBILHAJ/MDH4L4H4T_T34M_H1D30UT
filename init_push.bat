@echo off
setlocal enabledelayedexpansion

echo Checking for Git...
git --version >nul 2>nul
if errorlevel 1 (
    echo Git is not installed or not in PATH.
    exit /b 1
)

echo Checking if current directory is a Git repository...
git rev-parse --is-inside-work-tree >nul 2>nul
if errorlevel 1 (
    echo Not a Git repository. Initializing...
    git init
    if errorlevel 1 (
        echo Failed to initialize repository.
        exit /b 1
    )

    echo Adding all files...
    git add .

    echo Committing...
    git commit -m "Initial commit"
    if errorlevel 1 (
        echo Commit failed. Make sure there are files to commit.
        exit /b 1
    )

    echo Renaming branch to main...
    git branch -M main

    rem Check if remote 'origin' already exists
    git remote get-url origin >nul 2>nul
    if errorlevel 1 (
        echo No remote 'origin' configured.
        set /p remote_url="Enter GitHub repository URL (e.g., https://github.com/user/repo.git): "
        if "!remote_url!"=="" (
            echo No URL provided. Exiting.
            exit /b 1
        )
        git remote add origin !remote_url!
    )

    echo Pushing to GitHub...
    git push -u origin main
) else (
    echo Git repository already exists.

    rem Ensure we're on main branch (optional but good practice)
    git branch --show-current | findstr /i "main" >nul
    if errorlevel 1 (
        echo Current branch is not 'main'. Attempting to switch...
        git checkout main 2>nul || git checkout -b main
    )

    rem Check if remote 'origin' is configured
    git remote get-url origin >nul 2>nul
    if errorlevel 1 (
        echo No remote 'origin' configured.
        set /p remote_url="Enter GitHub repository URL (e.g., https://github.com/user/repo.git): "
        if "!remote_url!"=="" (
            echo No URL provided. Exiting.
            exit /b 1
        )
        git remote add origin !remote_url!
    )

    echo Pushing to GitHub...
    git push -u origin main
    if errorlevel 1 (
        echo Push failed. Make sure you have committed your changes.
        exit /b 1
    )
)

echo Done.
exit /b 0