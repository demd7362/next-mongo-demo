'use server'
import dbConnect from '@/app/_db/mongo'
import Comment from '@/app/_db/models/Comment'
import Post from '@/app/_db/models/Post'
import { notFound } from 'next/navigation'
import { getUserIdBySession, getUsernameBySession } from '@/utils/auth'
import PostLike from '@/app/_db/models/PostLike'
import User from '@/app/_db/models/User'
import { SignUpFormData } from '@/app/join/page'
import logger from '@/lib/logger'
import { put } from '@vercel/blob'

const PER_PAGE = 10

export const signUp = async (data: SignUpFormData) => {
  await dbConnect()
  const { password } = data
  const bcrypt = require('bcrypt')
  const hashedPassword = await bcrypt.hash(password, 10)
  data.password = hashedPassword
  try {
    const $user = await User.create(data)
    return !!$user
  } catch (e) {
    logger.error(e)
    return false
  }
}


export const getCommentsByPagination = async (postId: string, page: number) => {
  await dbConnect()
  const options = { page, limit: PER_PAGE }
  // @ts-ignore overwrite 되지않게 메모리에 올라가있는거 쓰면 ts 에러나서 ignore 처리
  const comments = await Comment.paginate({ postId }, options)
  return comments
}
export const getPostById = async (postId: string) => {
  await dbConnect()
  try {
    const $post = await Post.findOneAndUpdate({ _id: postId }, { $inc: { views: 1 } })
    // .populate('comments', 'author content', Comment)
    return $post
  } catch (e) {
    notFound()
  }
}

interface PostDataWithId extends PostData {
  postId: string
}

export const modifyPost = async (data: PostDataWithId) => {
  const { title, content, postId } = data
  await dbConnect()
  const author = await getUsernameBySession()
  if (!author) {
    return false
  }
  const $post = await Post.findOneAndUpdate({ _id: postId, author }, { $set: { title, content } })
  return !!$post
}
export const getPostsByPagination = async (page: number) => {
  await dbConnect()
  const options = {
    page,
    limit: PER_PAGE,
    sort: { createdAt: -1 }
  }
  // @ts-ignore overwrite 되지않게 메모리에 올라가있는거 쓰면 ts 에러나서 ignore 처리
  const $pagination = await Post.paginate({}, options)
  return $pagination
}

export const createComment = async (postId: string, content: string) => {
  await dbConnect()
  const author = await getUsernameBySession()
  if (!author) {
    return false
  }
  await Comment.create({
    content,
    postId,
    author
  })
  return true
}

export const modifyComment = async (commentId: string, content: string) => {
  await dbConnect()
  const username = await getUsernameBySession()
  if (!username) {
    return false
  }
  const result = await Comment.findOneAndUpdate({ _id: commentId, author: username }, {
    $set: {
      content
    }
  })
  return !!result
}

export const deleteComment = async (commentId: string) => {
  await dbConnect()
  const username = await getUsernameBySession()
  if (!username) {
    return false
  }
  const result = await Comment.findOneAndDelete(
    { _id: commentId, author: username }
  )
  return !!result
}

export const uploadFile = async (formData: FormData) => {
  const file = formData.get('file') as File
  const buffer = await file.arrayBuffer()
  const result = await put(`images/${file.name}`, buffer, { access: 'public' })
  return result.url
}

interface PostData {
  title: string
  content: string
}

export const createPost = async (data: PostData): Promise<{ postId: string | null }> => {
  const { title, content } = data
  const author = await getUsernameBySession()
  if (!author) {
    return {
      postId: null
    }
  }
  await dbConnect()
  const $post = await Post.create({
    title,
    content,
    author
  })
  const postId = await $post.get('_id')
  return {
    postId
  }
}
export const deletePost = async (postId: string) => {
  const author = await getUsernameBySession()
  if (!author) {
    return false
  }
  await dbConnect()
  const result = await Post.findOneAndDelete({ _id: postId, author })
  if (result) {
    await PostLike.deleteMany({ _id: postId })
    await Comment.deleteMany({ _id: postId })
    return true
  } else {
    return false
  }
}


export const changeLikes = async (postId: string, isLike: boolean) => {
  const userId = await getUserIdBySession()
  if (!userId) {
    return false
  }
  await dbConnect()
  const $postLike = await PostLike.findOne({ postId, userId })
  if ($postLike === null) { // 아무것도 안누른 게시글
    if (isLike) {
      await Post.updateOne({ _id: postId }, { $inc: { likes: 1 } })
    } else {
      await Post.updateOne({ _id: postId }, { $inc: { dislikes: 1 } })
    }
    await PostLike.create({ postId, userId, isLike })
  } else if ($postLike.get('isLike')) { // 기존에 좋아요 눌렀었음
    if (isLike) { // 다시 좋아요 눌렀으니 삭제
      await Post.updateOne({ _id: postId }, { $inc: { likes: -1 } })
      await PostLike.deleteOne({ _id: $postLike.get('_id') })
    } else { // 싫어요로 전환
      await Post.updateOne({ _id: postId }, { $inc: { likes: -1, dislikes: 1 } })
      await PostLike.updateOne({ _id: $postLike.get('_id') }, { $set: { isLike: false } })
    }
  } else { // 기존에 싫어요 눌렀었음
    if (isLike) { // 좋아요로 전환
      await Post.updateOne({ _id: postId }, { $inc: { likes: 1, dislikes: -1 } })
      await PostLike.updateOne({ _id: $postLike.get('_id') }, { $set: { isLike: true } })
    } else { // 다시 싫어요 눌렀으니 삭제
      await Post.updateOne({ _id: postId }, { $inc: { dislikes: -1 } })
      await PostLike.deleteOne({ _id: $postLike.get('_id') })
    }
  }
  return true
}

export const checkDuplicate = async (field: keyof Pick<SignUpFormData, 'nickname' | 'email'>, value: string) => {
  await dbConnect()
  const $user = await User.findOne({ [field]: value })
  return !!$user
}
