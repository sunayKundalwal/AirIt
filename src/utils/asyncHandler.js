const asyncHandler = (request) => {
    return (req,res,next) => {
        Promise.resolve(request(req,res,next)).catch((err) => console.log(err))

    }

}
export {asyncHandler}