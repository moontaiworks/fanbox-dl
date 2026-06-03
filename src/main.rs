fn main() {
    let exit_code = fanbox_dl::cli::run_main(std::env::args_os());
    std::process::exit(exit_code);
}
