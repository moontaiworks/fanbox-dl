use std::collections::HashMap;
use std::ffi::OsString;
use std::sync::Arc;

pub fn run_main<I, T>(args: I) -> i32
where
    I: IntoIterator<Item = T>,
    T: Into<OsString>,
{
    let values = args.into_iter().map(Into::into).collect::<Vec<_>>();
    crate::downloader::cli::run_cli(
        values.into_iter().skip(1).collect(),
        std::env::vars().collect::<HashMap<_, _>>(),
        None,
        Arc::new(|line| eprintln!("{line}")),
    )
}
