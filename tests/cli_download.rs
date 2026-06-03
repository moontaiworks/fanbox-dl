use assert_cmd::Command;
use predicates::prelude::*;

#[test]
fn prints_help() {
    let mut command = Command::cargo_bin("fanbox-dl").unwrap();
    command
        .arg("--help")
        .assert()
        .success()
        .stdout(predicate::str::contains("Download FANBOX posts"));
}

#[test]
fn rejects_missing_selector() {
    let mut command = Command::cargo_bin("fanbox-dl").unwrap();
    command
        .args(["download"])
        .assert()
        .failure()
        .stderr(predicate::str::contains("at least one creator selector"));
}
