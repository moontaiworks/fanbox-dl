#[tokio::main]
async fn main() {
    let code = fanbox_dl::cli::run_from_env().await;
    std::process::exit(code);
}
